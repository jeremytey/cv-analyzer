// configures and exports a single Redis client instance for use across the application
import Redis from 'ioredis';
import { env } from '../env';

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  ...(env.NODE_ENV === 'test' && {
    lazyConnect: true,
    enableOfflineQueue: false,
    retryStrategy: () => null, // null = don't retry, fail immediately
  }),
});