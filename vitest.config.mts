import "dotenv/config";
import { configDefaults, defineConfig } from "vitest/config";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { integrationEnvironment } = require("./scripts/test-database.cjs");
const integration = process.env.RUN_DB_INTEGRATION === "1";
if (integration) {
  // Also guard direct invocations: RUN_DB_INTEGRATION alone cannot expose app data.
  const env = integrationEnvironment(process.env);
  process.env.DATABASE_URL = env.DATABASE_URL;
  process.env.SCHOOL_TEST_SOURCE_DATABASE_URL = env.SCHOOL_TEST_SOURCE_DATABASE_URL;
}

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "./src") },
  },
  test: {
    ...(integration
      ? { include: ["**/*.integration.test.{js,jsx,ts,tsx,mjs,mts,cjs,cts}"] }
      : { exclude: [...configDefaults.exclude, "**/*.integration.test.*"] }),
    // The database suites share one database and each borrows global state —
    // the current academic year, grade order. Run files one at a time so they
    // cannot tear down rows another file is still using.
    fileParallelism: false,
  },
});
