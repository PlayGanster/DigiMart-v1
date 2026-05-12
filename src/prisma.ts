import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { config } from './config.js';

const { Pool } = pg;

let prismaInstance: PrismaClient | null = null;

export function getPrismaClient(): PrismaClient {
  if (prismaInstance) {
    return prismaInstance;
  }

  const pool = new Pool({
    connectionString: config.databaseUrl,
  });

  const adapter = new PrismaPg(pool);
  
  prismaInstance = new PrismaClient({
    adapter,
  });

  return prismaInstance;
}

export const prisma = getPrismaClient();

// Graceful shutdown
process.on('beforeExit', async () => {
  await prismaInstance?.$disconnect();
});

process.on('SIGINT', async () => {
  await prismaInstance?.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await prismaInstance?.$disconnect();
  process.exit(0);
});
