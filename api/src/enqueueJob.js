import { v4 as uuid } from 'uuid';
import { redis } from './redis.js';

const QUEUE_KEY = "queues:jobs";

export async function enqueueJob({ type, payload }) {
  const jobId = uuid();
  const now = Date.now();

  const job = {
    id: jobId,
    type,
    payload,
    status: 'queued',
    attempts: 0,
    maxAttempts: 3,
    createdAt: now,
    updatedAt: now,
    availableAt: now,
    idempotencyKey: jobId,
    error: null
  };

  // store job in Redis
  await redis.set(`job:${jobId}`, JSON.stringify(job));

  // add to sorted set for processing
  await redis.zadd(QUEUE_KEY, now, jobId);

  console.log(`[API] Enqueued job ${jobId} of type ${type}`);
  return { jobId,  status: 'queued' };
}