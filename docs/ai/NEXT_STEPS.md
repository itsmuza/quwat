# Next Steps

Updated: **2026-10-13**. Auth/Product catalog, client Saved, agent Attendance and offline Sales APIs are implemented; see COMPLETED_TASKS.md for checks.

## Deployment and integration

Attendance rollout requires running scripts/initialize-attendance.cjs once against an explicitly selected database on the launch day; the user-requested localhost setup repair initialized one missing agent in development Quwat on 2026-10-14 (Asia/Seoul), with enrollment day 2026-10-13 (Asia/Tashkent). No production database was initialized. It sets missing AGENT start dates without replacing existing dates. New role assignments initialize the date automatically. Validate setup idempotency, member promotion races, actual MongoDB request uniqueness, conflicting decisions and report queries in an isolated database. Frontend attendance sections and PENDING queue integration are implemented; examples are in ATTENDANCE_API.md.

Resolve existing duplicate product names before the unique index can be installed. Choose retained records explicitly; do not automatically delete or merge products. Test concurrent create/rename with the unique index in an isolated database.

1. Production database separation completed2026-10-17: quwat_prod is a verified full copy of Quwat in the same cluster, with scoped users and separate ignored environment files. See PRODUCTION_DATABASE.md. Production hosting remains a separate task.
2. The existing ADMIN/account records were copied under the approved full-data migration. Public signup still always creates CLIENT; subsequent role changes use the admin API.
3. Run database-backed integration/e2e tests against an isolated MongoDB server: lifecycle, aggregate favorites/visited/saved filtering and counting, saved unique-index concurrency, concurrent social activity and role/stock protection.
4. Coordinate the breaking frontend release using FRONTEND_MIGRATION.md. No old Property/USER/Board/Follow adapters exist.

Saved frontend integration is implemented: use the three client-only APIs, select Product.meSaved for bookmark state, and label saved ARCHIVED cards as unavailable without linking them to the ACTIVE-only public detail API. Copyable requests are in SAVED_PRODUCTS_API.md. Saved is independent of the implemented client cart and Sales workflow.

## Next backend milestone: stock intake

Add admin-only receiveStock and stock receipt history. Initial/manual total quantities are now supported in ADMIN catalog forms; this future additive receipt workflow remains separate. Use product `_id`, no SKU. Receipt quantities must respect units/minimum precision and atomically add to existing stock; preserve reservations and reject duplicate processing with idempotency. Define the transaction contract before implementation.

## Later commerce milestones

- Validate implemented sale reservations, approval/cancellation races, unique request keys and aggregates against a separate replica-set MongoDB. Do not run integration writes on deployment data.
- CREDIT records; interest-free debt, due date and partial repayments.
- Independent fulfillment and debt accounting; pickup/free delivery; no completed-sale returns.

Define non-payment sales permissions explicitly. Current decisions do not authorize agents to manage products, confirm orders, approve debt or change fulfillment.

## Remaining independent work

Upload-target validation is a pre-existing issue. Shared-library extraction and additional frontend improvements remain separate tasks. Keep tests disconnected from deployment databases and avoid dependency upgrades unrelated to a selected milestone.

## Sales integration prerequisite

The new sales module uses multi-document transactions and requires a replica set or supported sharded MongoDB deployment. No URI or database topology was changed. Service/GraphQL/browser fixtures pass without live database writes, but true MongoDB transaction concurrency remains an isolated integration check. Contract: SALES_API.md.
