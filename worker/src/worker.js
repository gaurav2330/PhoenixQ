import { redis } from './redis.js';
import { QUEUE_KEY, PROCESSING_KEY, VISIBILITY_TIMEOUT_MS, DLQ_KEY, BASE_RETRY_DELAY_MS } from './constants.js';
import { handleJob } from './handlers.js';
import { isIdempotent, markIdempotent } from './idempotency.js';
import { log } from './logger.js';

async function poll () {
  await requeueExpiredJobs();

  const now = Date.now();
  const jobIds = await redis.zrangebyscore(QUEUE_KEY, "-inf", now, "LIMIT", 0, 1);

  if (jobIds.length === 0) {
    // No jobs to process, wait and poll again
    await new Promise((resolve) => setTimeout(resolve, 500));
    return;
  }

  const jobId = jobIds[0];
  const visibilityDeadline = now + VISIBILITY_TIMEOUT_MS;

  log("info", "job_started", {
    jobId: job.id,
    correlationId: job.correlationId,
    attempt: job.attempts
  });

  // move job to processing set
  await redis
    .multi()
    .zrem(QUEUE_KEY, jobId)
    .zadd(PROCESSING_KEY, visibilityDeadline, jobId)
    .exec();

  const raw = await redis.get(`job:${jobId}`);
  if (!raw) {
    log("error", "job_data_not_found", { jobId });
    return;
  }

  const job = JSON.parse(raw);
  job.status = 'processing';
  await redis.set(`job:${jobId}`, JSON.stringify(job));

  try {
    const alreadyCompleted = await isIdempotent(job.idempotencyKey);
    if (alreadyCompleted) {
      log("warn", `Job ${jobId} already completed (idempotent). Skipping processing.`);

      await markCompleted(jobId, job);
      return;
    }

    await handleJob(job);
    await markIdempotent(job.idempotencyKey);
    await markCompleted(jobId, job);

    log("info", `job_completed`, {
      jobId: job.id,
      correlationId: job.correlationId,
      durationMs: Date.now() - now
    });
  } catch (err) {
    updateJobFailure(job, err);

    if (job.attempts >= job.maxAttempts) {
      await markJobAsDead(jobId, job);
      return;
    }

    // retry with backoff
    await retryJob(jobId, job);
  }
}

// Mark job as completed
async function markCompleted (jobId, job) {
  job.status = 'completed';
  job.updatedAt = Date.now();
  await redis.set(`job:${jobId}`, JSON.stringify(job));
  await redis.zrem(PROCESSING_KEY, jobId);
}

// Exponential backoff retry
async function retryJob (jobId, job) {
  const delay = BASE_RETRY_DELAY_MS * Math.pow(2, job.attempts);
  const nextAvailableAt = Date.now() + delay;

  job.status = 'queued';
  job.updatedAt = Date.now();
  job.availableAt = nextAvailableAt;

  await redis
    .multi()
    .set(`job:${jobId}`, JSON.stringify(job))
    .zrem(PROCESSING_KEY, jobId)
    .zadd(QUEUE_KEY, nextAvailableAt, jobId)
    .exec();

  log("warn", `job_retry_scheduled`, {
    jobId: job.id,
    correlationId: job.correlationId,
    attempt: job.attempts,
    nextAvailableAt
  });
}

// Mark job as dead and move to DLQ
async function markJobAsDead (jobId, job) {
  job.status = 'dead';
  job.deadAt = Date.now();
  job.updatedAt = Date.now();
  
  await redis
    .multi()
    .set(`job:${jobId}`, JSON.stringify(job))
    .zrem(PROCESSING_KEY, jobId)
    .zadd(DLQ_KEY, job.deadAt, jobId)
    .exec();

  await redis.incr("metrics:jobs:dlq");

  log("error", `job_dead_lettered`, {
    jobId: job.id,
    correlationId: job.correlationId,
    attempts: job.attempts
  });
}

function updateJobFailure (job, err) {
  job.attempts += 1;
  job.error = {
    message: err.message,
    failedAt: Date.now()
  };
}

// Re-queue jobs that have exceeded their visibility timeout
async function requeueExpiredJobs () {
  const now = Date.now();
  const expiredJobIds = await redis.zrangebyscore(PROCESSING_KEY, "-inf", now);

  for (const jobId of expiredJobIds) {
    log("info", `requeuing_expired_job`, { jobId });

    await redis
      .multi()
      .zrem(PROCESSING_KEY, jobId)
      .zadd(QUEUE_KEY, now, jobId)
      .exec();
  }
}

// Main worker loop
async function start () {
  while (true) {
    try {
      await poll();
    } catch (err) {
      log("error", "Error processing job:", { err });
    }
  }
}

// Kick off the worker
start();