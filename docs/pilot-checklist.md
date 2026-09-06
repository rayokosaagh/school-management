# Staff pilot acceptance — not yet executed

Run on a disposable staging deployment with no outbound notifications or real collections.
Record operator, date, device/browser, deployment version and pass/fail for each task.

| Task | Expected evidence |
| --- | --- |
| Sign in as administrator, office and teacher | Each sees permitted pages only; teacher sees their own classes/records. |
| Try a teacher POST to switch academic year | Denied on the server; active year unchanged. |
| Revoke a permission while a session is open | Next operation uses current grants, not an old token. |
| Issue class, transport and library bills twice | Eligible students only; no repeated charges. |
| Collect a partial payment, then the remaining balance | Exact allocations, correct receipt and outstanding total. |
| Interrupt a payment response and retry the same form/details | Original receipt returned; only one collection exists. |
| Close a form after an uncertain response | Staff checks receipt history before creating a new payment. |
| Attempt to overpay or collect a cancelled bill | Rejected; no receipt or ledger changes. |
| Print a cancelled invoice fixture | Clear cancelled/history warning; no collectible balance. |
| Run operational checks for current and prior years | Totals match the office ledger; selection does not activate a year. |
| Review activity history | Correct staff account, action and record; inaccessible to ordinary teachers/office. |
| Rehearse rollover with retained, promoted and departing students | Destination placements correct; understand immediate status changes and separate fee/service setup. |
| Repeat common tasks at 390px and on a slow connection | Table scrolling, student selection, validation, pending and failure messages remain usable. |
| Restore a full backup into an empty isolated target | Archive/count verification plus successful login, historical record, invoice, receipt and report checks. |

Do not mark the pilot accepted until critical failures are resolved and the school
administrator and the staff operating the collection counter sign off.
