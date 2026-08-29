import { PrismaClient } from "@/generated/prisma/client";

// In dev, Next.js hot-reloads modules on every save. A `new PrismaClient()` at
// module scope would therefore create a fresh client — and a fresh connection
// pool — on each reload, until Postgres refuses new connections. Stashing the
// instance on globalThis survives the reload; in production the module is only
// evaluated once, so the global is unnecessary there.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
