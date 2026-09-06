# Production-readiness handoff

This is a hardening pass, not certification for production. No real rollover,
payment collection, backup schedule or recovery cutover was performed by these checks.

## Available in the application

- Settings → Data → **Activity history**: append-only recorded billing, payment,
  class pricing, service registration, permission-matrix and year-transition events.
  The authenticated account comes from server authorization, not submitted form fields.
  Audit inserts share the mutation transaction; an audit failure prevents commit.
- Settings → Data → **Operational checks**: read-only year-specific reconciliation
  of invoice statuses, completed allocations, receipt totals and outstanding debt.
  Selecting a year here does not change the active school year. It flags inconsistencies;
  it does not repair records or carry balances between years.
- Payment submissions carry retry keys. Repeating the same key/details returns the
  existing receipt; altered details with an already-used key are rejected. Keys survive
  an interrupted response while the collection form stays mounted. Closing/reloading
  the form starts a new request: always inspect receipt history after uncertain outcomes.
- Cancelled invoices print as historical records with no collectible due.
- School-wide year switching requires registry-management permission on the server.

Audit coverage is deliberately explicit, not universal: account creation/deletion/role
assignment, every school-settings field, logins, reads, and direct SQL maintenance are
not centrally audited by this change. Existing payer/receiver snapshots still apply.
Events contain small metadata rather than passwords, complete student records or
payer details. Database owners can alter schema/triggers; off-site backups and restricted
database roles remain necessary. No historical audit events are fabricated.

## Deploy and rollback

1. Arrange a verified full backup before deployment under the school's recovery policy.
2. Apply additive migrations `20260906190000_audit_events` and
   `20260906191000_payment_requests` before enabling the new mutation code:
   `npx prisma migrate deploy`.
3. Run `npx prisma generate`, tests and a production build in the release environment;
   restart the application with the new build. Old Prisma clients can use the new
   audit/retry paths because these accesses use parameterized SQL, not new delegates.
4. Roll back application code if needed; **retain both tables and their records**.
   Older code ignores them but does not offer retry protection/auditing. Never drop
   history to roll back a release. No destructive down migration is supplied.

Existing invoices, payments and allocations are not rewritten by either migration.
The PaymentRequest foreign key deliberately prevents deleting its referenced receipt.
Do not bypass it: reversal/cancellation should preserve history.

## Required operator work before launch

- Configure encrypted, access-restricted backup storage, retention, off-site copies,
  a job schedule and failure/missing-backup alerts. See [recovery.md](recovery.md).
- Perform and record a real restore drill into an isolated database, then exercise
  the restored app. Unit tests of target guards are not proof of recoverability.
- Provision a dedicated integration database and run the DB suites via
  `npm run test:integration`. See [testing.md](testing.md). Default `npm test` never
  selects database integration suites.
- Complete [pilot-checklist.md](pilot-checklist.md) with real office/teacher users
  against a disposable staging deployment. Record pass/fail and staff sign-off.

## Year transition and accounting limits

Fee prices and transport/library/service registrations are still set up separately
for the destination year. Outstanding invoices remain collectible in their original
year, not copied or forgiven. Graduated/departed statuses take effect at rollover
confirmation even if the new year is not activated. Do not prepare irreversible
student decisions early under the assumption they are only drafts.

There is no new cancellation/refund/reversal workflow in this pass. Existing statuses
are interpreted safely and reconciled, but a school-approved adjustment workflow and
real concurrent-PostgreSQL tests are still required before relying on those operations.
