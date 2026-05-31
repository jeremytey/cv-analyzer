// verifies database and redis connectivity before starting the server
import { env } from './env';
import { app } from './app';
import { logger } from './lib/logger';
import { prisma } from './lib/prisma';
import { redis } from './lib/redis';
import { Server } from 'http';

let server: Server;

async function bootstrap() {
  try {
    // 1. Verify Database Connection Connectivity upfront
    logger.info('Connecting to PostgreSQL database via Prisma...');
    await prisma.$connect();
    logger.info('✅ Database connection established successfully.');

    // 2. Verify Redis Queue Connection Connectivity upfront
    logger.info('Connecting to Redis instance...');
    await new Promise<void>((resolve, reject) => {
      if (redis.status === 'ready') resolve();
      redis.once('ready', resolve);
      redis.once('error', reject);
    });
    logger.info('✅ Redis queue connection established successfully.');

    // 3. Bind the Express App to the validated system network port
    server = app.listen(env.PORT, () => {
      logger.info(`🚀 API Server successfully initialized and live on port ${env.PORT} [${env.NODE_ENV}]`);
    });

  } catch (error: any) {
    logger.error({
      message: '❌ CRITICAL: App bootstrapping phase failed. Terminating process.',
      error: error.message,
      stack: error.stack,
    });
    process.exit(1);
  }
}

// 4. GRACEFUL SHUTDOWN ARCHITECTURE
const handleGracefulShutdown = async (signal: string) => {
  logger.info(`Received ${signal}. Commencing graceful shutdown matrix...`);

  if (server) {
    logger.info('Closing HTTP server connections...');
    server.close(() => {
      logger.info('HTTP server closed cleanly.');
    });
  }

  try {
    logger.info('Disconnecting Prisma Client database connections...');
    await prisma.$disconnect();
    logger.info('Database pool drained.');

    logger.info('Disconnecting Redis Client connection handles...');
    redis.disconnect();
    logger.info('Redis client disconnected.');

    logger.info('System shutdown complete. Exiting cleanly. Safe travels. 🚀');
    process.exit(0);
  } catch (err: any) {
    logger.error({
      message: 'Error encountered during graceful shutdown routine execution',
      error: err.message,
    });
    process.exit(1);
  }
};

process.on('SIGTERM', () => handleGracefulShutdown('SIGTERM'));
process.on('SIGINT', () => handleGracefulShutdown('SIGINT'));

process.on('unhandledRejection', (reason: any) => {
  logger.error({
    message: 'CRITICAL UNHANDLED REJECTION DETECTED',
    reason: reason?.message || reason,
    stack: reason?.stack,
  });
  handleGracefulShutdown('UNHANDLED_REJECTION');
});

bootstrap();