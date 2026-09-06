import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { connection, validateTarget, parseArgs, toolEnvironment } = require("./db-recovery.cjs");
const url = (database: string, host = "localhost") => `postgresql://operator:secret@${host}:5432/${database}?sslmode=disable`;

describe("recovery command safety (no database connections)", () => {
  it("requires explicit operation and complete options", () => {
    expect(() => parseArgs([])).toThrow();
    expect(() => parseArgs(["backup"])).toThrow();
    expect(() => parseArgs(["restore-drill", "--backup-dir", "backup"])).toThrow();
    expect(() => parseArgs(["backup", "--output-dir", "a", "--clean", "yes"])).toThrow();
    expect(() => parseArgs(["backup", "--output-dir", "a", "--output-dir", "b"])).toThrow();
    expect(parseArgs(["backup", "--output-dir", "a"]).options["--output-dir"]).toBe("a");
  });

  it("rejects non-Postgres URLs and URL options that can redirect the connection", () => {
    for (const raw of [undefined, "bad secret", "https://operator@host/db", "postgresql://host/db", `${url("school")}&host=elsewhere`, `${url("school")}&dbname=elsewhere`, `${url("school")}&schema=private`]) {
      expect(() => connection(raw)).toThrow();
    }
  });

  it("requires explicit TLS policy and rejects weakened TLS modes", () => {
    expect(() => connection("postgresql://operator:secret@host/school")).toThrow();
    expect(() => connection(url("school").replace("disable", "require"))).toThrow();
    expect(connection(url("school").replace("disable", "verify-full")).env.PGSSLMODE).toBe("verify-full");
  });

  it("accepts Prisma pool options without passing them to PostgreSQL", () => {
    const parsed = connection(`${url("school")}&schema=public&connection_limit=3&pool_timeout=10`);
    expect(parsed.database).toBe("school");
    expect(parsed.env.PGPASSWORD).toBe("secret");
    expect(parsed.env.connection_limit).toBeUndefined();
  });

  it("requires disposable naming and exact confirmation", () => {
    const source = connection(url("school"));
    expect(() => validateTarget(source, connection(url("production")), "production")).toThrow();
    expect(() => validateTarget(source, connection(url("school_restore_drill_test")), "yes")).toThrow();
    expect(() => validateTarget(source, connection(url("school_restore_drill_test")), "school_restore_drill_test")).not.toThrow();
  });

  it("refuses the source name even through another hostname", () => {
    const source = connection(url("school_restore_drill_source"));
    const alias = connection(url(source.database, "127.0.0.1"));
    expect(() => validateTarget(source, alias, alias.database)).toThrow();
    const target = connection(url("school_restore_drill_archive"));
    expect(() => validateTarget(source, target, target.database, target.database)).toThrow();
  });

  it("removes inherited PostgreSQL overrides before launching client tools", () => {
    vi.stubEnv("PGOPTIONS", "-c search_path=malicious");
    vi.stubEnv("PGSERVICE", "production");
    vi.stubEnv("PGHOSTADDR", "203.0.113.1");
    try {
      const env = toolEnvironment(connection(url("school")));
      expect(env.PGOPTIONS).toBeUndefined();
      expect(env.PGSERVICE).toBeUndefined();
      expect(env.PGHOSTADDR).toBeUndefined();
      expect(env.PGDATABASE).toBe("school");
    } finally { vi.unstubAllEnvs(); }
  });
});
