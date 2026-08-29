import "dotenv/config";
import { defineConfig } from "vitest/config";
import path from "node:path";

// Next loads .env on its own; vitest does not, and the database tests need it.
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "./src") },
  },
  test: {
    // The database suites share one database and each borrows global state —
    // the current academic year, grade order. Run files one at a time so they
    // cannot tear down rows another file is still using.
    fileParallelism: false,
  },
});
