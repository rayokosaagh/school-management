# Student fees

Additive rollout: apply migration, generate Prisma client, deploy compatible application. No existing fee is reclassified and no historical invoice, line, payment, class price or allocation is modified by this migration. Selection is explicit; class membership never opts a student in.

The application can explicitly move a named CLASS fee to STUDENT scope. This school-wide classification applies across academic years; the UI requires confirmation. Frequency stays unchanged. Pause billing while changing a fee's scope or deploying mixed application versions. Saved class prices remain available in the database, but the compatible application excludes non-CLASS fees from class billing.

Assignments are deactivated, never deleted. New bills snapshot the saved price; edits do not rewrite old bills. An existing invoice for the same student, fee and period (including legacy class bills) blocks rebilling. Monthly fees are billed only from saved selections, without automatic monthly scheduling or prorating.

Rollback application with billing paused; retain the additive schema and data. Do not drop tables/links once used. Old application versions cannot administer student fees; registry-only restore points are not financial backups. RESTRICT foreign keys preserve plans and assignments during registry deletion.
