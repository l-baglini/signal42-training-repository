/**
 * prisma-client.ts
 * ----------------
 * Singleton PrismaClient.
 *
 * Next.js hot-reloads modules in development, which would otherwise spawn a new
 * PrismaClient (and a new connection pool) on every reload until the database
 * runs out of connections. Caching the instance on `globalThis` keeps a single
 * client across reloads. In production a fresh module graph means a single
 * client anyway.
 */

import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
