// loading environment variables and validating them using Zod. 
// correctly typed before application starts, preventing runtime crashes.
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z
      .string()
      .transform((val) => parseInt(val, 10))
      .default('3000'),
    DATABASE_URL: z.string().url(),
    REDIS_URL: z.string().url(),
    FRONTEND_URL: z.string().url().optional(), // Marked optional here, enforced via refinement below
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV === 'production' && !data.FRONTEND_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['FRONTEND_URL'],
        message: 'FRONTEND_URL is strictly required when NODE_ENV is set to production',
      });
    }
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