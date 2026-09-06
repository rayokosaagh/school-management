# Student transport rollout

Apply this additive migration, generate the Prisma client, then deploy the new app. Pause fee billing during rollout: an old application instance does not understand billingScope and can still issue class-wide transport. No historical plan, invoice line, payment, or allocation is removed or rewritten. Existing recognized transport heads are classified separately; inspect any custom transport fee names before rollout. Students are **not** automatically registered from class membership.

Existing transport charges for a student/month prevent another transport bill for that month. New invoices snapshot the registered price and pickup location. Registration edits only affect subsequently issued bills, including any older months subsequently billed. Pausing stops issuance until reactivated; the start month can be moved forward when resuming. This is not a prorated route/subscription system.

Rollback: roll back the application with billing paused and retain the additive schema and registrations. Do not drop the registration table or invoice link once in use. An old app will not expose transport registrations and may resume class-wide transport billing, so do not re-enable billing until the compatible application is restored or those old class lines are explicitly handled. Existing invoices and payments remain readable throughout.

Enrollment deletion is restricted while a transport registration exists, preserving registration and invoice references. Year teardown cannot currently back up financial records; do not treat registry-only restore points as finance backups.
