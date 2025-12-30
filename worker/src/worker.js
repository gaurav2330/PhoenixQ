import { redis } from './redis.js';
import { QUEUE_KEY, PROCESSING_KEY, VISIBILITY_TIMEOUT_MS, DLQ_KEY, BASE_RETRY_DELAY_MS } from './constants.js';
import { handleJob } from './handlers.js';
import { isIdempotent, markIdempotent } from './idempotency.js';

console.log('[WORKER] Worker started, waiting for jobs...');

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

  // move job to processing set
  await redis
    .multi()
    .zrem(QUEUE_KEY, jobId)
    .zadd(PROCESSING_KEY, visibilityDeadline, jobId)
    .exec();

  const raw = await redis.get(`job:${jobId}`);
  if (!raw) {
    console.error(`[WORKER] Job data not found for job ID ${jobId}`);
    return;
  }

  const job = JSON.parse(raw);
  job.status = 'processing';
  await redis.set(`job:${jobId}`, JSON.stringify(job));

  try {
    const alreadyCompleted = await isIdempotent(job.idempotencyKey);
    if (alreadyCompleted) {
      console.warn(`[WORKER] Job ${jobId} already completed (idempotent). Skipping processing.`);

      await markCompleted(jobId, job);
      return;
    }

    await handleJob(job);
    await markIdempotent(job.idempotencyKey);
    await markCompleted(jobId, job);

    console.log(`[WORKER] Successfully completed job ${jobId}`);
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

  console.warn(`[WORKER] Job ${jobId} failed on attempt ${job.attempts}. Retrying in ${delay} ms.`);
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

  console.error(`[WORKER] Job ${jobId} failed after ${job.attempts} attempts. Moved to DLQ.`);
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
    console.log(`[WORKER] Re-queuing expired job ${jobId}`);

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
      console.error('[WORKER] Error processing job:', err);
    }
  }
}

// Kick off the worker
start();