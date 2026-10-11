# Session Prompts and Reusable Work Requests

Snapshot: **2026-10-11**. Historical excerpts below retain the intent of this session. Reusable prompts describe future tasks; they do not authorize changes merely by existing in this file.

## Useful historical prompts

### Initial analysis request — original excerpt

> bu nestar monorepo structure ni qurilish materiallari sotadigan QUWAT nomli platmofmaga migratsiya qiliish uchun analize qil

### Domain corrections — normalized summary

```text
Replace Property with Product and USER with CLIENT.
Agents sell products; administrators inspect/update data and receive stock.
Remove Board and Follow. Existing property data, accounts and IDs need not be imported.
Only four sale units: dona, qop, metr, kg. Use whole UZS so‘m, without tiyin.
Admin stock receipt adds incoming quantity: 10 existing + 100 received = 110.
One store with a shared catalog/warehouse; clients alone create orders.
Cash, card and interest-free credit payments happen at the store; no online payment service.
Track debt, due dates and partial receipts. Delivery is free. No returns.
```

### Safe rename request — original excerpt

> safe rename layer (no business logic change)
> rename all visible project/app identifiers from Nestar to Quwat. do not change domain logic. keep apis and database collections unchanged. update package names, environtment lables constants. run lint and typecheck after refactoring. please make plan first!

### Implemented milestone — condensed from the approved plan

```text
Rename apps/nestar → apps/quwat and apps/nestar-batch → apps/quwat-batch.
Rename NestarBatch classes/files/imports; update Nest project keys, scripts, output paths,
package/package-lock root names, welcome text, tests and README.
Preserve GraphQL contracts, domain modules, collections, environment connection values,
cron schedules, dependencies and existing user edits.
Defer comparePassword await and all Product/CLIENT/commerce changes.
Run typechecks, lint without autofix, both builds and a content-preservation audit.
Report pre-existing lint blockage rather than repairing unrelated tooling.
```

## Next-session bootstrap prompt

```text
Read AGENTS.md and the six files in docs/, then inspect git status and current source.
The safe Nestar → Quwat project rename is complete. Domain code may still be Property,
USER, Board and Follow; do not assume the planned Product/CLIENT migration has shipped.
Distinguish implemented work, explicit requirements, planning defaults and open decisions.
Preserve existing user changes and do not emit secrets or mutate a live database.
Summarize current state, then carry out only the specific task requested in this session.
Resolve the Petoria frontend naming discrepancy before rebranding another repository.
```

## Targeted login fix prompt

```text
Fix the missing await on comparePassword() in
apps/quwat/src/components/member/member.service.ts.
Add a regression test proving a wrong password is rejected and a correct password succeeds.
Keep existing GraphQL/role/database contracts unchanged. Do not combine this with Product
renaming or unrelated cleanup. Run the relevant tests and both app typechecks, and report
pre-existing tooling blockers. Update docs/COMPLETED_TASKS.md with actual results.
```

## Separate lint repair prompt

```text
Investigate eslint.config.mjs importing typescript-eslint while package.json declares
@typescript-eslint/parser and @typescript-eslint/eslint-plugin instead.
Inspect installed versions and propose the smallest compatible tooling repair first.
Do not upgrade unrelated packages, run broad autofix, change domain logic, or suppress
rules merely to get a green result. Distinguish configuration errors from source findings.
After the agreed repair, run lint without autofix and both app typechecks; document results.
```

## Product and role migration prompt

```text
Plan the next breaking domain phase using docs/BACKEND_MIGRATION.md and docs/DECISIONS.md.
Replace Property with Product and USER with CLIENT across schemas, enums, DTOs, resolvers,
guards, lookups and batch dependencies. Remove Board and Follow and all associated counters.
Retain product/member Like/View/Comment. One store; agents manage the shared catalog and
sales, clients create orders, admins inspect/update records and receive stock.
Use only PIECE/BAG/METER/KG and integer UZS so‘m. Do not import legacy data or silently
change a MongoDB connection. Specify the exact GraphQL contract and validation rules first.
Do not implement cart/payment/debt/delivery in this phase unless explicitly requested.
```

## Admin stock receipt prompt

```text
Implement administrator-only warehouse receipt against the approved Product/Inventory model.
For an existing SKU, 10 in stock + 100 received must become 110. Preserve reservations.
Record SKU/product, quantity, time and admin; atomically increment quantity in the same
transaction as the receipt. Duplicate requests must not create duplicate intake.
Agents/clients cannot use this operation or bypass it through product quantity updates.
Use the four agreed units and quantity-step validation. Test concurrency, duplicate requests,
rollback and permissions using an isolated database. Document actual API names and results.
```

## Orders, offline payment and delivery prompt

```text
Plan and then implement the specifically approved commerce slice for one Quwat store.
Clients alone create orders; agents confirm and record actual in-store CASH/CARD receipts.
CREDIT is interest-free approved debt with a due date, optional upfront payment and partial
cash/card repayments. Money is whole so‘m; no gateway or online-payment button.
Keep debt settlement separate from fulfillment. Delivery is free; require recipient/address/
phone. Reserve, cancel/release and handover/deduct stock atomically and idempotently.
No completed-sale returns/refunds. Resolve assignment and receipt-correction rules first.
Test ownership, rounding, partial payments, overpayment, races and transaction rollback.
```

## Frontend discovery/migration prompt

```text
Inspect the actual Next.js frontend repository; do not invent existing routes/components.
Read docs/FRONTEND_MIGRATION.md. Confirm whether Petoria is a typo for Quwat or an intentional
frontend brand. Inventory router version, GraphQL client/operations, codegen, auth and tests.
Separate branding-only work compatible with today's Property API from the future Product/
CLIENT cutover. Map verified old files to new product/catalog/client/agent/admin screens.
Remove Board/Follow in the domain phase, add four-unit/whole-so‘m UI, offline receipt/debt
views and free delivery. Coordinate generated types and cache changes with the actual schema.
Make a plan before editing; run that repository's own validation and update the docs.
```

## Documentation-only update prompt

```text
Update only docs/BACKEND_MIGRATION.md, DECISIONS.md, FRONTEND_MIGRATION.md,
COMPLETED_TASKS.md, NEXT_STEPS.md and PROMPTS.md from source and current-session evidence.
Do not edit application code, config, lockfiles or credentials. Mark proposals separately
from completed work; record exact validation outcomes and unresolved frontend naming.
Check relative links and verify every file outside docs/ remains unchanged.
```

