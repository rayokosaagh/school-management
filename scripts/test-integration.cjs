#!/usr/bin/env node
require("dotenv/config");
const { spawn } = require("node:child_process");
const path = require("node:path");
const { integrationEnvironment } = require("./test-database.cjs");

try {
  // Original environment is never mutated. Only the child receives the test URL.
  const env = integrationEnvironment(process.env);
  const executable = path.join(path.dirname(require.resolve("vitest/package.json")), "vitest.mjs");
  const child = spawn(process.execPath, [executable, "run", ...process.argv.slice(2)], {
    cwd: path.resolve(__dirname, ".."), env, stdio: "inherit", shell: false, windowsHide: true,
  });
  child.on("error", () => { console.error("Could not start the integration test runner."); process.exitCode = 1; });
  child.on("exit", (code) => { process.exitCode = code ?? 1; });
} catch (error) {
  // Validation errors are deliberately value-free: never print database URLs.
  console.error(error.message);
  process.exitCode = 1;
}
