import { PrismaClient } from '@prisma/client';
import { beforeAll, afterEach, afterAll } from '@jest/globals';

export const prisma = new PrismaClient();

beforeAll(async () => {
  await prisma.$connect();
});

afterEach(async () => {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "analyses" RESTART IDENTITY CASCADE;`);
});

afterAll(async () => {
  await prisma.$disconnect();
});