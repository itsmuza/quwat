# Quwat Session Prompts

Updated: **2026-10-11**. Earlier discussions about subtype, SKU and agent catalog ownership are superseded by the latest approved milestone.

## Accepted user requirements

- MemberType: CLIENT, ADMIN, AGENT.
- ProductSubtype does not exist; the actual name belongs in productName and must be unique after trimming across all statuses.
- Agents cannot create/edit/own products. Only ADMIN manages the catalog.
- The store has one admin; products have no creator/updater member attribution.
- Agents participate in sales by confirming payment; payment becomes COMPLETED.
- Product catalog now; stock receipts, orders and payments in later milestones.

## Resume development

```text
Read AGENTS.md, SKILLS.md and all six docs/ai files. Inspect git status and current
source before edits. Auth/Product migration is implemented: ADMIN-only product writes,
free productName, no SKU/subtype/ownership, CLIENT/ADMIN/AGENT, no Board/Follow.
Preserve user changes. Distinguish future commerce requirements from existing APIs.
Run focused tests, both app typechecks, non-mutating lint and sequential builds.
Update COMPLETED_TASKS.md with actual outcomes and limitations.
```

## Stock intake task

```text
Plan and implement the separately selected admin-only stock intake milestone.
Use product _id. Existing 10 + incoming 100 must become 110; preserve reservations.
Record quantity, time, product and admin with atomic/idempotent processing.
Catalog inputs must remain unable to change stock. Confirm the transaction contract
before adding commerce assumptions. No agent ownership, SKU or subtype.
```

## Payment planning task

```text
Define the future offline payment workflow before implementation. Agents confirm
eligible PENDING payments and payment status becomes COMPLETED. Keep payment receipt,
remaining debt and fulfillment independent. Specify amount validation, partial payment,
concurrent confirmation/idempotency and permissions for other roles explicitly.
Do not infer product management, order confirmation, debt approval or delivery-update
rights for agents from old proposals.
```

## Frontend task

```text
Locate the frontend repository, read its instructions and baseline checks, then adapt
to the implemented backend contract in FRONTEND_MIGRATION.md. Regenerate GraphQL types,
remove housing/Board/Follow/agent catalog management and keep product writes ADMIN-only.
Commerce APIs are not callable yet. Validate auth, WholeSom, ACTIVE visibility and role/stock protection.
```
