# Safe test execution

`npm test` runs unit/component tests. Files named `*.integration.test.*` are excluded by default, even when a file filter names one explicitly. Database suites are opt-in because they create/update/delete fixture records and some exercise global school state.

## Database integration suites

1. Provision an isolated disposable PostgreSQL database whose name starts `school_test_` (lowercase letters, numbers and underscores only). Use a dedicated database role that has no privileges on the application database. Never use a school-data copy containing real personal information.
2. Apply the repository's Prisma migrations to that disposable database through a separately reviewed setup step. The runner does not create, migrate, seed or delete databases.
3. Supply the application's `DATABASE_URL` for the source-name guard, and the isolated `TEST_DATABASE_URL` securely through the environment. The runner loads existing `.env` values but requires `TEST_DATABASE_URL` explicitly; it does not infer a test database from the application URL. The names must differ even when the hosts differ, guarding against host aliases.
4. Run all database suites, or supply a file filter:

```powershell
node scripts/test-integration.cjs
node scripts/test-integration.cjs src/lib/fees/student-fees.integration.test.ts
```

Only the child process receives the test URL as `DATABASE_URL`. The normal application environment is unchanged. Vitest revalidates the target before loading integration suites, so manually setting `RUN_DB_INTEGRATION=1` does not bypass validation. Tests run sequentially because their fixtures share global state. Normal unit tests do not run in this mode.

Database naming checks prevent common mistakes, not deliberate configuration tampering. Enforce isolation with database credentials/network permissions as well. Keep the disposable database exclusive to the test run, inspect failures there, and destroy/recreate it only with explicit operator approval. These commands do not establish production-readiness by themselves; restore drills and real workflow acceptance remain separate checks.
