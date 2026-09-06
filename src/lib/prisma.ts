import { PrismaClient } from "@/generated/prisma/client";

// In dev, Next.js hot-reloads modules on every save. A `new PrismaClient()` at
// module scope would therefore create a fresh client — and a fresh connection
// pool — on each reload, until Postgres refuses new connections. Stashing the
// instance on globalThis survives the reload; in production the module is only
// evaluated once, so the global is unnecessary there.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// A client built by an earlier `prisma generate` does not grow new model
// delegates during Fast Refresh: `prisma.announcement` stays undefined until
// the whole server is restarted.
//
// Naming a model as the sentinel — `"studentFeePlan" in cached` — only ever
// caught the one expansion somebody remembered to write down. The next
// migration added Announcement, the cached client still had studentFeePlan,
// the guard called it fresh, and the dashboard died on an undefined delegate.
//
// Identity answers it for every expansion instead. Regenerating rewrites the
// client module, so Fast Refresh evaluates a new `PrismaClient` class and an
// instance built from the previous one no longer passes `instanceof`. An
// ordinary reload, where the module is untouched, keeps the same class and so
// keeps the same client.
const previous = globalForPrisma.prisma;
const reusable = previous instanceof PrismaClient ? previous : undefined;

// The replaced client keeps its pool open otherwise, and enough of those in a
// long dev session exhaust Postgres — which is the failure the global exists
// to prevent in the first place.
if (previous && !reusable) void previous.$disconnect().catch(() => {});

export const prisma = reusable ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
