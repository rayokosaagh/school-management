// Pure safety checks shared by Vitest configuration and the opt-in runner.
function databaseName(raw) {
  let parsed;
  try { parsed = new URL(raw); } catch { throw new Error("A valid PostgreSQL URL is required for both DATABASE_URL and TEST_DATABASE_URL."); }
  if (!["postgres:", "postgresql:"].includes(parsed.protocol) || !parsed.hostname || !parsed.username) {
    throw new Error("Database URLs must specify a PostgreSQL host and user.");
  }
  const name = decodeURIComponent(parsed.pathname.slice(1));
  if (!name || /[\s/\\\0]/.test(name)) throw new Error("Database URLs must specify a simple database name.");
  return { name, parsed };
}

function validateTestDatabaseUrl(testUrl, applicationUrl) {
  const target = databaseName(testUrl);
  const application = databaseName(applicationUrl);
  if (!/^school_test_[a-z0-9_]+$/.test(target.name)) throw new Error("TEST_DATABASE_URL must name an isolated school_test_* database using lowercase letters, digits and underscores.");
  if (target.name === application.name) throw new Error("Integration tests cannot use the application database name, including through a different hostname.");
  const allowed = new Set(["schema", "sslmode", "connection_limit", "pool_timeout", "connect_timeout", "statement_cache_size", "pgbouncer", "application_name"]);
  for (const [key, value] of target.parsed.searchParams) {
    if (!allowed.has(key) || (key === "schema" && value !== "public")) throw new Error("TEST_DATABASE_URL contains unsupported routing or schema options.");
  }
  return testUrl;
}

function integrationEnvironment(env) {
  const source = env.SCHOOL_TEST_SOURCE_DATABASE_URL || env.DATABASE_URL;
  const target = validateTestDatabaseUrl(env.TEST_DATABASE_URL, source);
  return { ...env, RUN_DB_INTEGRATION: "1", SCHOOL_TEST_SOURCE_DATABASE_URL: source, DATABASE_URL: target };
}

module.exports = { validateTestDatabaseUrl, integrationEnvironment };
