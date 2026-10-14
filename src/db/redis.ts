import 'dotenv/config';
import { createClient } from 'redis';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

export const redisClient = createClient({
  url: REDIS_URL,
  socket: {
    reconnectStrategy: (retries) => Math.min(retries * 200, 3000),
  },
})

// duplicate() inherits the same options, including the retry strategy
export const pubClient = redisClient.duplicate();
export const subClient = redisClient.duplicate();

const logError = (label: string) => (err: Error) =>
  console.error(`[Redis] ${label} error:`, err.message);

redisClient.on('error', logError('client'));
pubClient.on('error', logError('pub'));
subClient.on('error', logError('sub'));

const STARTUP_TIMEOUT_MS = 3000;

export const connectRedis = async (): Promise<void> => {
  try {
    await Promise.race([
      Promise.all([redisClient.connect(), pubClient.connect(), subClient.connect()]),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`no response within ${STARTUP_TIMEOUT_MS}ms`)), STARTUP_TIMEOUT_MS)
      ),
    ]);
    console.log('[Redis] Connected');
  } catch (err) {
    console.error('[Redis] Unavailable at startup, continuing without cache:', err instanceof Error ? err.message : err);
  }
};