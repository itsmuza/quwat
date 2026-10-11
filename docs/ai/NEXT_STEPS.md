# Next Steps

Updated: **2026-10-11**. The approved auth/Product catalog milestone is implemented; see COMPLETED_TASKS.md for checks.

## Deployment and integration

Resolve existing duplicate product names before the unique index can be installed. Choose retained records explicitly; do not automatically delete or merge products. Test concurrent create/rename with the unique index in an isolated database.

1. Configure a fresh Quwat database in a separate deployment task; preserve old databases and environment values until then.
2. Provision the initial ADMIN through an explicit trusted setup task. Public signup always creates CLIENT; subsequent role changes use the admin API.
3. Run database-backed integration/e2e tests against an isolated MongoDB server: lifecycle, aggregate favorites/visited filtering, indexes, concurrent social activity and role/stock protection.
4. Coordinate the breaking frontend release using FRONTEND_MIGRATION.md. No old Property/USER/Board/Follow adapters exist.

## Next backend milestone: stock intake

Add admin-only receiveStock and stock receipt history. Product quantities currently remain zero. Use product `_id`, no SKU. Receipt quantities must respect units/minimum precision and atomically add to existing stock; preserve reservations and reject duplicate processing with idempotency. Define the transaction contract before implementation.

## Later commerce milestones

- Client cart and orders, price snapshots, reservations and cancellation.
- Agent confirmation of pending payment → COMPLETED, with eligibility/idempotency and amount validation.
- Offline CASH/CARD/CREDIT records; interest-free debt, due date and partial repayments.
- Independent fulfillment and debt accounting; pickup/free delivery; no completed-sale returns.

Define non-payment sales permissions explicitly. Current decisions do not authorize agents to manage products, confirm orders, approve debt or change fulfillment.

## Remaining independent work

Upload-target validation is a pre-existing issue. Shared-library extraction and Next.js migration remain separate tasks. Keep tests disconnected from deployment databases and avoid dependency upgrades unrelated to a selected milestone.
