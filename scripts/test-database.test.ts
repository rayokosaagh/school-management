import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { integrationEnvironment, validateTestDatabaseUrl } = require("./test-database.cjs");
const app = "postgresql://operator:secret@localhost:5432/school";
const test = "postgresql://operator:secret@localhost:5432/school_test_verification?schema=public";

describe("isolated integration database guard", () => {
  it("requires both an explicit test target and application source for comparison", () => {
    expect(() => validateTestDatabaseUrl(undefined, app)).toThrow();
    expect(() => validateTestDatabaseUrl(test, undefined)).toThrow();
    expect(() => integrationEnvironment({ DATABASE_URL: app, RUN_DB_INTEGRATION: "1" })).toThrow();
  });

  it("only accepts explicitly named isolated databases", () => {
    for (const name of ["school", "postgres", "school_test_", "school_test_A", "school_test_prod/name"]) {
      expect(() => validateTestDatabaseUrl(test.replace("school_test_verification", name), app)).toThrow();
    }
    expect(validateTestDatabaseUrl(test, app)).toBe(test);
  });

  it("refuses an application database that already has a test-like name through any host alias", () => {
    expect(() => validateTestDatabaseUrl(test.replace("localhost", "127.0.0.1"), test)).toThrow();
    expect(() => validateTestDatabaseUrl(test.replace("localhost", "other-server"), test)).toThrow();
  });

  it("blocks connection-string options that redirect host/database or change schema", () => {
    for (const suffix of ["&host=production", "&dbname=school", "&options=-csearch_path=private", "&schema=private"]) {
      expect(() => validateTestDatabaseUrl(test + suffix, app)).toThrow();
    }
  });

  it("returns a separate child environment without changing the application environment", () => {
    const original = { DATABASE_URL: app, TEST_DATABASE_URL: test, CUSTOM: "keep" };
    const child = integrationEnvironment(original);
    expect(original.DATABASE_URL).toBe(app);
    expect(child.DATABASE_URL).toBe(test);
    expect(child.SCHOOL_TEST_SOURCE_DATABASE_URL).toBe(app);
    expect(child.RUN_DB_INTEGRATION).toBe("1");
    expect(child.CUSTOM).toBe("keep");
    expect(integrationEnvironment(child).DATABASE_URL).toBe(test);
  });

  it("does not leak URLs or passwords in validation errors", () => {
    try { validateTestDatabaseUrl("secret-not-a-url", app); } catch (error) {
      expect(String(error)).not.toContain("secret");
      expect(String(error)).not.toContain("postgresql://");
    }
  });
});
