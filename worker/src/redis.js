import Redis from 'ioredis';

export const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: 6379,
});

redis.on('connect', () => {
  console.log('[WORKER] Connected to Redis');
});

redis.on('error', (err) => {
  console.error('[WORKER] Redis error:', err);
});