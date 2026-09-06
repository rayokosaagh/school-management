# Claude handoff — uncommitted shared worktree
Captured 2026-09-07. Workspace: D:\Project\Web-Project\SchoolMgmnt\school-management

The user requested this handoff to the working Claude agent. No direct Claude messaging tool is connected, so this document is the local handoff, not confirmation of message delivery.

## Ownership and Git state
Nothing was staged or committed by this handoff. All implementation is already present in this shared worktree.
The tree includes Codex changes AND concurrent/user changes. Do not attribute every diff to Codex or reset/discard any of it.
Use `git diff` for tracked changes and the untracked inventory below to read new files directly; Git diff alone omits untracked source.
Do not include ignored .env credentials, database dumps or private exports in a commit.
The snapshot below predates this handoff file itself. Re-run status before staging.

## Latest fix (user reported ActivityPage undefined element)
- src/components/ui/page-frame.tsx now exports Body as PageFrameBody while preserving PageFrame.Body for client consumers.
- Settings Activity and Readiness server pages import/render PageFrameBody directly. Static properties attached to a client component are not usable as named client references across Next's server boundary.
- src/app/dashboard/settings/operational-pages.test.tsx now mocks only named exports, not .Body. Old pages reproduced the exact crash (2 failing render tests); patched pages pass all 4.
- Latest verification: those 4 tests, TypeScript and targeted ESLint passed.
- Read node_modules/next/dist/docs/ before Next changes; AGENTS.md warns this Next 16.3.3 release has changed APIs.

## Recent completed features
1. Year deletion moved from Classes UI to Settings → Data, beside restore points:
   - settings/_components/year-deletion.tsx lists years; current year deletion disabled.
   - delete-year-dialog.tsx moved from classes/_components to settings/_components.
   - Existing server deletion actions remain in classes/actions.ts and retain manage:settings, typed confirmation, restore-point option, and financial protection.
   - No actual year deleted during this move. 22 focused tests + TS/lint passed.
2. Header date badge corrected:
   - src/lib/date/year-status.ts returns past/present/upcoming independently of school activation.
   - dashboard layout/top-bar/year-switcher pass yearStatus, not lossy todayInYear boolean.
   - Upcoming year now labelled correctly; start/end inclusive. 12 focused tests + TS/lint passed.
3. Rollover under Settings → Academic → Prepare next academic year:
   - /dashboard/settings/academic-years owns page; /dashboard/rollover redirects there.
   - Main Next year nav removed. Sequential preparation/student review/confirmation, explicit activation caveat.
   - Registry-only staff clicking Settings are redirected to that specific tool before privileged settings data loads.
   - Old records remain in old year. Fee prices/service registrations do NOT copy. Graduated/left student statuses change immediately at confirmation, even with deferred activation. No automatic rollover undo.
   - User reports deleting 2084 and successfully using restore points; do not infer further data manipulation is requested.
4. Readiness safeguards:
   - Settings → Data → Activity history: append-only audit records for payment collection, class/transport/service invoice issuance, class pricing saves, fee-type deletion, transport/service setup/status, permission matrix changes/reset, rollover, current-year switching.
   - Audit writes share owning transactions; actor comes from server authorization.
   - Not universal auditing: account lifecycle/role assignment, login/read events and every settings field are NOT covered.
   - Settings → Data → Operational checks: read-only year reconciliation (receipt allocations, cross-year allocations, invoice statuses, invalid/overallocated lines, cancelled invoices with completed payments), totals/outstanding, manual transition checklist.
   - Critical fix: header switchAcademicYear previously only required sign-in; now enforces manage:registry. Current-year service serializes switches and audits actor. Classes switch also passes actor.
   - Partial-payment allocation order made deterministic (line id ascending).
   - PaymentRequest retry mapping: server action requires UUID, recordPayment accepts optional requestKey for library compatibility, SHA256 semantic fingerprint, invoice row lock, original receipt returned on same-key retry before balance read. Altered payload/key reuse refused. Mapping/payment/audit share transaction.
   - Collection form retains retry key through interrupted response, catches network error. Closing/reloading form loses key; staff must inspect receipt history after uncertain outcome.
   - Cancelled invoice printing clearly history-only with zero collectible due.
5. Earlier fees/UI work:
   - Class pricing groups admission/yearly and monthly charges by grade, while keeping separate frequency handling.
   - CLASS / TRANSPORT / STUDENT scopes. Transport per-enrollment registration with pickup location/price/start month/active state.
   - Services tab replaces separate transport and student-fees tabs; library and other STUDENT plans only bill selected students.
   - Manage fee types is creation entry; Services redundant Add service strip removed. Existing unconfigured type gets price-only setup.
   - Student picker/table, search/filter/pagination, registration editing. Concurrent agent has continued table/avatar/bulk-selection UI changes; preserve them.
   - Fixed PostgreSQL advisory-lock void-deserialization bug using SELECT 1 AS locked FROM pg_advisory_xact_lock(...).
6. Earlier overview/auth:
   - Role/user-scoped overview redesign; 404; login create-account link removed.
   - Concurrent/user edits include announcements, school logo, theme, data-table and other files; inspect actual diff.

## Schema/deployment
Applied to local school_mgmt_db:
- 20260906190000_audit_events: new AuditEvent table/indexes, trigger rejects UPDATE/DELETE/TRUNCATE.
- 20260906191000_payment_requests: new PaymentRequest table, unique payment link, restrictive receipt FK.
At last check all 23 migrations were applied. These additions did not rewrite bills/payments.
Audit/retry table accesses use parameterized SQL so existing generated Prisma clients work without new delegates.
Prisma schema validation passed. Generate Prisma client during normal release build/restart.
Rollback code if needed but retain audit/retry tables/history; do not drop them to undo a release.
Earlier fee/transport/student-fee/announcement migrations are also in untracked inventory and applied.

## Verification
- Latest broad safe run BEFORE subsequent header/delete placement/latest boundary patches: 479 tests / 54 files passed; production build passed including /settings/activity and /settings/readiness.
- Subsequent header fix: 12 focused tests + TS/lint.
- Subsequent delete placement: 22 focused tests + TS/lint.
- Latest boundary fix: 4 focused tests + TS/lint.
These counts are historical checkpoints, not a claim all were re-run against the very latest tree.
- Default npm test now excludes *.integration.test.*. Never undo this to run tests on app data.
- npm run test:integration requires explicit TEST_DATABASE_URL with isolated school_test_* name different from app database name, even across host aliases. Tests affect only spawned test process environment.
- No real concurrent-PostgreSQL/integration suites, live restore drill or staff acceptance were completed during readiness pass.
- Browser skill was read and in-app bootstrap attempted; tool failed with missing sandboxPolicy metadata. No interactive browser verification claimed for Settings.
- Concurrent fee UI edits briefly caused missing Checkbox/StudentAvatar/bulk symbols during earlier gates; those settled and subsequent broad tests/build passed. Do not revert concurrent changes.

## Recovery/operations
- npm run db:backup → scripts/db-recovery.cjs backup
- npm run db:restore-drill → same tool restore-drill
- Backup: pg_dump custom archive, exported read-only repeatable-read snapshot, table counts, SHA256 manifest, archive listing check.
- Restore only explicitly named/confirmed empty school_restore_drill_* target; rejects source/manifest DB name across aliases; verifies hash and full table inventory/counts.
- No production overwrite/drop/cleanup/schedule enabled. Tools suppress raw driver errors and keep credentials out of command args.
- PostgreSQL 17 pg_dump/pg_restore are on PATH locally.
- Backups unencrypted by tool: configure encrypted/restricted external storage, off-site copy, retention and monitoring. Windows NTFS permissions need operator setup.
- Still need user hosting + backup destination to enable scheduling, actual restore drill, DB tests and staff pilot sign-off.
- docs/production-readiness.md, docs/recovery.md, docs/testing.md, docs/pilot-checklist.md detail coverage, limitations and procedures.
- No new refund/cancellation/reversal mutation workflow; existing stored-status behavior only.
- No automatic fees/services carryover or deferred-graduation lifecycle added.

## Exact Git status snapshot (all untracked paths), branch and HEAD
```text
warning: unable to access 'C:\Users\ToriKoSaagh/.config/git/ignore': Permission denied
warning: unable to access 'C:\Users\ToriKoSaagh/.config/git/ignore': Permission denied
 M .gitignore
 M next.config.ts
 M package.json
 M prisma/schema.prisma
 M scripts/ui-smoke.cjs
 M src/app/(auth)/login/login-form.tsx
 M src/app/(auth)/login/page.tsx
 M src/app/dashboard/_components/nav-model.test.ts
 M src/app/dashboard/_components/nav-model.ts
 M src/app/dashboard/_components/top-bar.tsx
 M src/app/dashboard/_components/year-switcher.tsx
 M src/app/dashboard/actions.ts
 M src/app/dashboard/classes/_components/classes-view.tsx
 D src/app/dashboard/classes/_components/delete-year-dialog.tsx
 M src/app/dashboard/classes/actions.ts
 M src/app/dashboard/layout.tsx
 M src/app/dashboard/loading.tsx
 M src/app/dashboard/page.tsx
 M src/app/dashboard/rollover/_components/review-step.tsx
 M src/app/dashboard/rollover/_components/rollover-workspace.tsx
 M src/app/dashboard/rollover/_components/year-step.tsx
 M src/app/dashboard/rollover/actions.ts
 M src/app/dashboard/rollover/page.tsx
 M src/app/dashboard/settings/_components/school-form.tsx
 M src/app/dashboard/settings/actions.ts
 M src/app/dashboard/settings/page.tsx
 M src/app/globals.css
 M src/app/layout.tsx
 M src/components/ui/brand-mark.tsx
 M src/components/ui/bs-date-field.tsx
 M src/components/ui/data-table.tsx
 M src/components/ui/page-frame.tsx
 M src/components/ui/photo-field.tsx
 M src/lib/auth/permissions.ts
 M src/lib/auth/roles.test.ts
 M src/lib/auth/roles.ts
 M src/lib/dashboard/alerts.test.ts
 M src/lib/dashboard/alerts.ts
 M src/lib/dashboard/overview.ts
 M src/lib/date/bs.test.ts
 M src/lib/date/bs.ts
 M src/lib/prisma.ts
 M src/lib/registry/academic-year.ts
 M src/lib/registry/rollover.ts
 M src/lib/registry/school.ts
 M src/lib/registry/year-teardown.ts
 M src/lib/utils.ts
 M vitest.config.mts
?? artifacts/fee-setup-check/billing-1440.png
?? artifacts/fee-setup-check/billing-390.png
?? artifacts/fee-setup-check/entry.jsx
?? artifacts/fee-setup-check/field-refresh.png
?? artifacts/fee-setup-check/focused-pricing-1440.png
?? artifacts/fee-setup-check/focused-pricing-390.png
?? artifacts/fee-setup-check/focused-pricing-dark-1440.png
?? artifacts/fee-setup-check/focused-pricing-dark-390.png
?? artifacts/fee-setup-check/index.html
?? artifacts/fee-setup-check/pricing-1440.png
?? artifacts/fee-setup-check/pricing-390.png
?? artifacts/fee-setup-check/pricing-check.mjs
?? artifacts/fee-setup-check/pricing-dark-1440.png
?? artifacts/fee-setup-check/pricing-dark-390.png
?? artifacts/fee-setup-check/run.mjs
?? artifacts/fee-setup-check/services-check.mjs
?? artifacts/fee-setup-check/services-library-1440.png
?? artifacts/fee-setup-check/services-library-390.png
?? artifacts/fee-setup-check/services-register-1440.png
?? artifacts/fee-setup-check/services-register-390.png
?? artifacts/fee-setup-check/services-transport-1440.png
?? artifacts/fee-setup-check/services-transport-390.png
?? artifacts/fee-setup-check/services-types-1440.png
?? artifacts/fee-setup-check/services-types-390.png
?? artifacts/fee-setup-check/student-fees-1440.png
?? artifacts/fee-setup-check/student-fees-390.png
?? artifacts/fee-setup-check/transport-1440.png
?? artifacts/fee-setup-check/transport-390.png
?? artifacts/fee-setup-check/transport-audit.cjs
?? artifacts/fee-setup-check/transport-edit-1440.png
?? artifacts/fee-setup-check/transport-edit-390.png
?? artifacts/fee-setup-check/types-1440.png
?? artifacts/fee-setup-check/types-390.png
?? artifacts/overview-preview/admin-dark-1440.png
?? artifacts/overview-preview/admin-dark-390.png
?? artifacts/overview-preview/admin-dark.html
?? artifacts/overview-preview/admin-light-1440.png
?? artifacts/overview-preview/admin-light-390.png
?? artifacts/overview-preview/admin-light.html
?? artifacts/overview-preview/office-dark-1440.png
?? artifacts/overview-preview/office-dark-390.png
?? artifacts/overview-preview/office-dark.html
?? artifacts/overview-preview/office-light-1440.png
?? artifacts/overview-preview/office-light-390.png
?? artifacts/overview-preview/office-light.html
?? artifacts/overview-preview/teacher-dark-1440.png
?? artifacts/overview-preview/teacher-dark-390.png
?? artifacts/overview-preview/teacher-dark.html
?? artifacts/overview-preview/teacher-light-1440.png
?? artifacts/overview-preview/teacher-light-390.png
?? artifacts/overview-preview/teacher-light.html
?? docs/pilot-checklist.md
?? docs/production-readiness.md
?? docs/recovery.md
?? docs/testing.md
?? prisma/migrations/20260904120000_fees/migration.sql
?? prisma/migrations/20260905120000_fees_monthly_instalments/migration.sql
?? prisma/migrations/20260905160000_fee_frequency_on_type/migration.sql
?? prisma/migrations/20260905180000_fee_notes_and_payer/migration.sql
?? prisma/migrations/20260906120000_student_transport/README.md
?? prisma/migrations/20260906120000_student_transport/migration.sql
?? prisma/migrations/20260906150000_student_fee_plans/README.md
?? prisma/migrations/20260906150000_student_fee_plans/migration.sql
?? prisma/migrations/20260906160000_announcements/migration.sql
?? prisma/migrations/20260906190000_audit_events/migration.sql
?? prisma/migrations/20260906191000_payment_requests/migration.sql
?? scripts/db-recovery.cjs
?? scripts/db-recovery.test.ts
?? scripts/overview-preview.mjs
?? scripts/test-database.cjs
?? scripts/test-database.test.ts
?? scripts/test-integration.cjs
?? src/app/api/school-logo/route.ts
?? src/app/dashboard/_components/announcement-forms.tsx
?? src/app/dashboard/_components/announcements-panel.tsx
?? src/app/dashboard/_components/overview-panels.tsx
?? src/app/dashboard/_components/overview-workspace.test.tsx
?? src/app/dashboard/_components/overview-workspace.tsx
?? src/app/dashboard/_components/year-switcher.test.tsx
?? src/app/dashboard/fees/_components/balances-tab.tsx
?? src/app/dashboard/fees/_components/fee-matrix.tsx
?? src/app/dashboard/fees/_components/fee-segmented.tsx
?? src/app/dashboard/fees/_components/fee-types-sheet.tsx
?? src/app/dashboard/fees/_components/fees-forms.tsx
?? src/app/dashboard/fees/_components/fees-workspace.tsx
?? src/app/dashboard/fees/_components/money-cells.tsx
?? src/app/dashboard/fees/_components/pupil-pane.tsx
?? src/app/dashboard/fees/_components/service-rail.tsx
?? src/app/dashboard/fees/_components/service-roster.tsx
?? src/app/dashboard/fees/_components/services-panel.test.tsx
?? src/app/dashboard/fees/_components/services-panel.tsx
?? src/app/dashboard/fees/_components/setup-header.tsx
?? src/app/dashboard/fees/_components/setup-tab.tsx
?? src/app/dashboard/fees/_components/stat-chips.tsx
?? src/app/dashboard/fees/_components/step-panel.tsx
?? src/app/dashboard/fees/_components/step-tabs.tsx
?? src/app/dashboard/fees/_components/student-fees-panel.tsx
?? src/app/dashboard/fees/_components/student-picker.tsx
?? src/app/dashboard/fees/_components/transport-panel.tsx
?? src/app/dashboard/fees/actions.ts
?? src/app/dashboard/fees/page.tsx
?? src/app/dashboard/fees/print/_components/print-button.tsx
?? src/app/dashboard/fees/print/page.tsx
?? src/app/dashboard/fees/student-fee-actions.ts
?? src/app/dashboard/fees/transport-actions.ts
?? src/app/dashboard/rollover/_components/rollover-workspace.test.tsx
?? src/app/dashboard/settings/_components/delete-year-dialog.tsx
?? src/app/dashboard/settings/_components/year-deletion.test.tsx
?? src/app/dashboard/settings/_components/year-deletion.tsx
?? src/app/dashboard/settings/academic-years/page.tsx
?? src/app/dashboard/settings/activity/page.tsx
?? src/app/dashboard/settings/operational-pages.test.tsx
?? src/app/dashboard/settings/readiness/page.tsx
?? src/app/dashboard/year-switch-permissions.test.ts
?? src/app/not-found.tsx
?? src/components/ui/theme-bootstrap.tsx
?? src/lib/announcements/announcements.ts
?? src/lib/announcements/visibility.test.ts
?? src/lib/announcements/visibility.ts
?? src/lib/audit.test.ts
?? src/lib/audit.ts
?? src/lib/auth/guard.test.ts
?? src/lib/auth/permission-audit.test.ts
?? src/lib/dashboard/insights.ts
?? src/lib/dashboard/overview-scope.test.ts
?? src/lib/dashboard/standing.test.ts
?? src/lib/dashboard/standing.ts
?? src/lib/date/year-status.ts
?? src/lib/fees/class-billing-scope.test.ts
?? src/lib/fees/delete-fee-head.integration.test.ts
?? src/lib/fees/documents.ts
?? src/lib/fees/fee-type-filters.test.ts
?? src/lib/fees/fee-type-filters.ts
?? src/lib/fees/fees.integration.test.ts
?? src/lib/fees/fees.ts
?? src/lib/fees/grouped-billing.test.ts
?? src/lib/fees/grouped-billing.ts
?? src/lib/fees/invoice-document-safety.test.tsx
?? src/lib/fees/money.ts
?? src/lib/fees/payment-safety.test.ts
?? src/lib/fees/reconciliation.test.ts
?? src/lib/fees/reconciliation.ts
?? src/lib/fees/student-fees.integration.test.ts
?? src/lib/fees/student-fees.test.ts
?? src/lib/fees/student-fees.ts
?? src/lib/fees/transport.integration.test.ts
?? src/lib/fees/transport.test.ts
?? src/lib/fees/transport.ts
redesign/phase-2
5677565

```

