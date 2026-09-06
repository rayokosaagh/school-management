#!/usr/bin/env node
// Opt-in operations only. Never creates, drops, cleans or replaces a database.
const { spawn } = require("node:child_process");
const { createHash } = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { Client } = require("pg");

function connection(raw) {
  let url;
  try { url = new URL(raw); } catch { throw new Error("Provide a valid PostgreSQL connection URL through the environment."); }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || !url.username) throw new Error("A PostgreSQL host and explicit user are required.");
  const database = decodeURIComponent(url.pathname.slice(1));
  if (!database || /[\s/\\\0]/.test(database)) throw new Error("An explicit simple database name is required.");
  const env = {};
  for (const [key, value] of url.searchParams) {
    if (key === "schema" && value === "public") continue;
    if (["connection_limit", "pool_timeout", "pgbouncer"].includes(key)) continue;
    const allowed = { sslmode: "PGSSLMODE", connect_timeout: "PGCONNECT_TIMEOUT", application_name: "PGAPPNAME" };
    if (!allowed[key]) throw new Error("Unsupported connection option; use a direct PostgreSQL URL with public schema.");
    env[allowed[key]] = value;
  }
  if (!["disable", "verify-full"].includes(env.PGSSLMODE)) throw new Error("Explicit sslmode=verify-full or sslmode=disable is required.");
  return {
    database,
    env: { ...env, PGHOST: url.hostname, PGPORT: url.port || "5432", PGDATABASE: database,
      PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password) },
  };
}

function validateTarget(source, target, confirmation, manifestSource) {
  if (!/^school_restore_drill_[a-z0-9_]+$/.test(target.database)) throw new Error("Target name must begin school_restore_drill_ and contain only lowercase letters, digits and underscores.");
  if (target.database === source.database || target.database === manifestSource) throw new Error("The application/source database cannot be a restore target, including through a different host alias.");
  if (confirmation !== target.database) throw new Error("--confirm-target must exactly match the disposable target database name.");
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (!["backup", "restore-drill"].includes(command)) throw new Error("Usage: db-recovery.cjs backup --output-dir <existing directory> | restore-drill --backup-dir <directory> --confirm-target <database>");
  const allowed = command === "backup" ? ["--output-dir"] : ["--backup-dir", "--confirm-target"];
  const options = {};
  for (let i = 0; i < rest.length; i += 2) {
    if (!allowed.includes(rest[i]) || !rest[i + 1] || rest[i + 1].startsWith("--") || options[rest[i]]) throw new Error("Unknown, duplicated or incomplete option.");
    options[rest[i]] = rest[i + 1];
  }
  if (allowed.some((key) => !options[key])) throw new Error("All command options must be supplied explicitly.");
  return { command, options };
}

// Do not inherit PGOPTIONS, PGSERVICE, alternate host, or ambient credentials.
function toolEnvironment(conn) {
  return { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith("PG"))), ...conn.env };
}

function runTool(tool, args, conn) {
  return new Promise((resolve, reject) => {
    const child = spawn(tool, args, { env: toolEnvironment(conn), shell: false, windowsHide: true, stdio: "ignore" });
    child.on("error", () => reject(new Error(`${tool} could not start. Install compatible PostgreSQL client tools and check PATH.`)));
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`${tool} failed. Check client/server versions, credentials, privileges and connectivity; raw database output is suppressed to protect private data.`)));
  });
}

function clientFor(conn) {
  // libpq-style environment for CLI; explicit options for node-postgres.
  const sslmode = conn.env.PGSSLMODE;
  if (sslmode && !["disable", "verify-full"].includes(sslmode)) throw new Error("Use sslmode=verify-full (TLS) or sslmode=disable (isolated local database).");
  return new Client({ host: conn.env.PGHOST, port: Number(conn.env.PGPORT), database: conn.database,
    user: conn.env.PGUSER, password: conn.env.PGPASSWORD,
    ssl: sslmode === "verify-full" ? { rejectUnauthorized: true } : false,
    connectionTimeoutMillis: 15_000, application_name: "school-recovery" });
}

const quote = (identifier) => `"${identifier.replaceAll('"', '""')}"`;
async function inventory(client) {
  const { rows } = await client.query("SELECT n.nspname AS schema, c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('r','p') AND n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' ORDER BY n.nspname,c.relname");
  const result = [];
  for (const table of rows) {
    const count = await client.query(`SELECT count(*)::text AS count FROM ${quote(table.schema)}.${quote(table.name)}`);
    result.push({ ...table, count: count.rows[0].count });
  }
  return result;
}

async function checksum(file) {
  const hash = createHash("sha256");
  const handle = await fs.open(file, "r");
  for await (const chunk of handle.createReadStream()) hash.update(chunk);
  return hash.digest("hex");
}

async function backup(conn, outputDir) {
  const client = clientFor(conn);
  const directory = await fs.mkdtemp(path.join(path.resolve(outputDir), "school-backup-"));
  await fs.chmod(directory, 0o700);
  const archive = path.join(directory, "database.dump");
  try {
    await client.connect();
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const snapshot = await client.query("SELECT pg_export_snapshot() AS snapshot");
    const tables = await inventory(client);
    await runTool("pg_dump", ["--format=custom", "--no-owner", "--no-privileges", `--snapshot=${snapshot.rows[0].snapshot}`, `--file=${archive}`], conn);
    await client.query("COMMIT");
    await fs.chmod(archive, 0o600);
    await runTool("pg_restore", ["--list", archive], conn);
    await fs.writeFile(path.join(directory, "manifest.json"), JSON.stringify({ version: 1, createdAt: new Date().toISOString(), sourceDatabase: conn.database, sha256: await checksum(archive), tables }, null, 2), { flag: "wx", mode: 0o600 });
    return directory;
  } finally { await client.end(); }
}

async function restoreDrill(source, target, directory, confirmation) {
  // Validate the explicit target before even reading the archive.
  validateTarget(source, target, confirmation);
  const manifest = JSON.parse(await fs.readFile(path.join(directory, "manifest.json"), "utf8"));
  validateTarget(source, target, confirmation, manifest.sourceDatabase);
  if (manifest.version !== 1 || !Array.isArray(manifest.tables) || typeof manifest.sourceDatabase !== "string") throw new Error("Unsupported backup manifest.");
  const archive = path.resolve(directory, "database.dump");
  if (await checksum(archive) !== manifest.sha256) throw new Error("Backup checksum mismatch. Restore refused.");
  await runTool("pg_restore", ["--list", archive], target);
  const client = clientFor(target);
  try {
    await client.connect();
    const identity = await client.query("SELECT current_database() AS name");
    if (identity.rows[0].name !== target.database) throw new Error("Connected database does not match the confirmed target.");
    const objects = await client.query("SELECT count(*)::int AS count FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%'");
    if (objects.rows[0].count !== 0) throw new Error("Restore target is not empty. Nothing was overwritten; provision a fresh disposable database.");
    await runTool("pg_restore", ["--exit-on-error", "--single-transaction", "--no-owner", "--no-privileges", `--dbname=${target.database}`, archive], target);
    const restored = await inventory(client);
    if (JSON.stringify(restored) !== JSON.stringify(manifest.tables)) throw new Error("Restored table inventory/counts differ from the source snapshot. Keep the disposable database for investigation.");
    return { verifiedAt: new Date().toISOString(), tablesVerified: restored.length, archiveSha256: manifest.sha256 };
  } finally { await client.end(); }
}

async function main(argv = process.argv.slice(2)) {
  const { command, options } = parseArgs(argv);
  const source = connection(process.env.DATABASE_URL);
  if (command === "backup") {
    const directory = await backup(source, options["--output-dir"]);
    console.log(`Backup created and archive checked: ${directory}. Run a restore drill before relying on it.`);
  } else {
    const report = await restoreDrill(source, connection(process.env.RESTORE_DATABASE_URL), options["--backup-dir"], options["--confirm-target"]);
    console.log(JSON.stringify(report, null, 2));
  }
}

module.exports = { connection, validateTarget, parseArgs, toolEnvironment, main };
if (require.main === module) main().catch(() => {
  // Never echo an unexpected driver error: it can contain credentials or student data.
  console.error("Recovery operation failed. No automatic cleanup was attempted. Check explicit options, target emptiness, archive checksum, database access and PostgreSQL client installation; see docs/recovery.md.");
  process.exitCode = 1;
});
