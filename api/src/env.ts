// loading environment variables and validating them using Zod. 
// correctly typed before application starts, preventing runtime crashes.
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z
    .string()
    .transform((val) => parseInt(val, 10))
    .refine((val) => !isNaN(val) && val > 0 && val <= 65535, {
      message: 'PORT must be a valid port number between 1 and 65535',
    })
    .default('3000'),
  DATABASE_URL: z
    .string()
    .url({ message: 'DATABASE_URL must be a valid URL string' })
    .startsWith('postgresql://', { message: 'DATABASE_URL must be a PostgreSQL connection string' }),
  REDIS_URL: z
    .string()
    .url({ message: 'REDIS_URL must be a valid URL string' })
    .startsWith('redis://', { message: 'REDIS_URL must be a valid Redis connection string' }),
});

const parseEnv = () => {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('CRITICAL: Invalid environment variables configuration:');
    result.error.issues.forEach((issue) => {
      console.error(`   - Field [${issue.path.join('.')}]: ${issue.message}`);
    });
    process.exit(1);
  }
  return result.data;
};

export const env = parseEnv();