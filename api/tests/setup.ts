import { PrismaClient } from '@prisma/client';
import { jest, beforeAll, afterEach, afterAll } from '@jest/globals';
import { redis } from '../src/lib/redis';
import { app } from '../src/app';
import http from 'http';

export const prisma = new PrismaClient();
export let server: http.Server;

jest.spyOn(redis, 'lpush').mockResolvedValue(1);
redis.disconnect();

beforeAll(async () => {
  await prisma.$connect();
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
});

afterEach(async () => {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "analyses" RESTART IDENTITY CASCADE;`);
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve()))
  );
  await prisma.$disconnect();
  redis.disconnect(true);
});