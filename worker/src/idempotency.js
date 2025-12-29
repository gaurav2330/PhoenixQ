import { redis } from './redis.js';

export async function markIdempotent(key) {
  await redis.set(`idempotency:${key}`, 'completed');
}

export async function isIdempotent(key) {
  const exists = await redis.exists(`idempotency:${key}`);
  return exists === 1;
}