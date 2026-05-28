// configures and exports a single Redis client instance for use across the application
import Redis from 'ioredis';
import { env } from '../env';

// Completely safe to consume the validated env object here
export const redis = new Redis(env.REDIS_URL, {
  // Fail-fast configuration for transactional API stability under sudden load spikes
  maxRetriesPerRequest: 3, 
});