# Backend Migration: Nestar → Quwat

Session snapshot: **2026-10-11**, Asia/Seoul. Latest repository commit observed: `10ae5e3` (`fix: Modify project name into Quwat`).

## Status and scope

The **safe project rename is completed**. The **construction-materials domain migration is planned, not implemented**. This documentation task changes Markdown files only.

| Layer | Current implementation | Agreed future target |
| --- | --- | --- |
| Project/app names | `quwat`, `quwat-batch`, `QuwatBatch*` | Keep Quwat naming |
| Catalog domain | Property and real-estate fields | Product and construction-material fields |
| Roles | USER, AGENT, ADMIN | CLIENT, AGENT, ADMIN |
| Community | BoardArticle and Follow remain registered | Remove both and their dependencies |
| Commerce | No inventory, cart, order, payment, debt or delivery services | Implement these in a separate phase |
| Data | Existing collections and environment connection values unchanged | New Quwat database; no legacy-data import |

## Original project summary

Nestar is a NestJS 10, TypeScript, code-first GraphQL/Apollo and Mongoose monorepo for real-estate listings. It has an API app and a scheduled batch app, not independently deployed domain microservices. Authentication uses JWT and bcrypt. The API includes member, auth, property, comment, like, view, follow and board-article components, uploads and a WebSocket gateway.

Property requires fields such as type, location, address, title, price, square area, beds and rooms. Types include APARTMENT/VILLA/HOUSE; locations are Korean cities. Batch jobs rank properties and agents. Notification and Notice schemas exist without corresponding feature services/resolvers in this repository.

## New project summary and migration goal

Quwat will support **one construction-materials store with one shared catalog and warehouse**. Agents are store staff, not independent marketplace sellers. Clients create orders; agents confirm sales and record in-store payments. Administrators inspect/update data, manage accounts and receive incoming stock. Delivery is free. The platform has no online payment service and no completed-sale returns/refunds feature.

### Target product and money rules

- Product: SKU, name, category, brand, description, images, technical attributes, sale unit, unit price, minimum quantity, quantity step and creation/update attribution.
- Only four units: PIECE (dona), BAG (qop), METER (metr), KG (kg).
- Planning defaults: PIECE/BAG use whole quantities; METER/KG allow up to three decimal places. Each independently sold variant has its own SKU.
- Prices, receipts and debt balances are **integer UZS so‘m**, never tiyin. The planning rounding rule is nearest whole so‘m per line, with `.5` rounded upward; order totals sum rounded lines.
- Product lifecycle: DRAFT, ACTIVE, ARCHIVED. Zero stock does not permanently mark a replenishable product SOLD.

## Completed naming changes

| Previous identifier | Current identifier |
| --- | --- |
| Package `nestar` | `quwat` |
| `apps/nestar` | `apps/quwat` |
| `apps/nestar-batch` | `apps/quwat-batch` |
| `NestarBatchModule/Controller/Service` | `QuwatBatchModule/Controller/Service` |
| Batch source files `nestar-batch.*.ts` | `quwat-batch.*.ts` |
| `dist/apps/nestar*` script/output paths | `dist/apps/quwat*` paths |
| Nestar welcome messages | Quwat welcome messages |

Nest project keys, source roots, cross-app imports, tests, README and package-lock root names were updated. Dependencies and generic names such as AppModule were retained. Environment keys and batch constants have no Nestar branding and were retained.

## Planned module changes

| Module/subsystem | Required future work |
| --- | --- |
| Property | Replace with Product across services, DTOs, schemas, enums, resolvers and batch code; remove housing fields and filters |
| Member/Auth | USER → CLIENT; prevent public signup/profile role escalation; admin grants agent access |
| BoardArticle/Follow | Remove modules, DTOs/schemas/enums, Member counters/`meFollowed`, lookups, Comment branches and ranking dependencies |
| Like/View/Comment | Replace PROPERTY references with PRODUCT; remove ARTICLE handling; retain product/member functions |
| Category | Add material categories and catalog filtering |
| Inventory | Admin-only stock receipt; total/reserved/available quantities; receipt history and idempotency |
| Cart/Order | Client-owned cart/orders, price snapshots, reservation and fulfillment |
| Payment/Credit | Agent-recorded offline receipts and interest-free debt with due dates/partial repayment |
| Delivery | Pickup or free delivery; recipient/address/phone and fulfillment updates |
| Shared code/batch | Extract shared libraries from the API app; update product ranking and add overdue-debt processing |

Stock receipt must increment existing stock: **10 + 100 = 110**, not replace 10 with 100. A new SKU requires a product card plus initial receipt. Agents must not change stock through ordinary product updates. The planned transaction includes the receipt record and atomic quantity increment. Reservations do not disappear when new stock arrives.

Clients alone initiate orders. Planned order states are PENDING → CONFIRMED → COMPLETED, plus eligible cancellation. Fulfillment and payment/debt status must remain independent: a delivered credit sale can be COMPLETED while money is still owed. Cash/card sales require full payment before handover; credit requires agent approval and a due date. Credit can include an initial cash/card payment and subsequent partial repayments.

## GraphQL changes

**Completed phase:** resolver operation names, argument names, GraphQL types, enum values, nullability and domain fields were unchanged. HTTP routes and WebSocket events were unchanged; root welcome response text was rebranded.

**Future phase:** introduce Product types/inputs and Product operation names, replace USER with CLIENT, remove Board/Follow operations, and add inventory/cart/order/payment/credit/delivery operations. Exact proposed mappings are recorded in [FRONTEND_MIGRATION.md](FRONTEND_MIGRATION.md). These names are not currently callable APIs. Final money/quantity wire types and range validation still need a contract review.

## MongoDB collections and schemas

| Current collection | Current status | Future disposition |
| --- | --- | --- |
| `properties` | Unchanged schema and unique type/location/title/price index | New `products` schema; replace housing index with SKU uniqueness |
| `members` | USER default and property/article/follow counters unchanged | CLIENT default; remove obsolete counters; rename product statistics |
| `likes`, `views`, `comments` | Unchanged PROPERTY/ARTICLE references | Product/member groups; revise lookups and discriminator-aware indexes |
| `boardArticles`, `follows` | Schemas/modules remain | Do not include in the new domain database |
| `notifications`, `notices` | Schemas exist; no implemented feature module | Clean obsolete property/article references; decide actual feature scope separately |
| New commerce collections | Not implemented | Proposed categories, inventory/stock receipts, carts, orders, payments and debts; delivery may be embedded in an order |

No collections, indexes, schema fields, IDs, enum defaults or documents were migrated by the rename. MongoDB URI values and database selection remain untouched. The future new database is a separate deployment decision; no database deletion is authorized by these documents. Multi-document commerce transactions require a replica-set-capable MongoDB deployment.

## Compatibility notes and known gaps

- An existing Nestar frontend can continue using the current GraphQL schema after the safe rename. Build/deployment references to old app paths must be updated.
- The future domain migration is deliberately breaking: old Property queries, housing filters and USER guards must change together with the frontend. Legacy-data/API adapters are not part of that future target.
- `apps/quwat/src/components/member/member.service.ts:51` still lacks `await` on `comparePassword()`. The fix was discussed and requested, but explicitly deferred from the rename-only implementation.
- Signup/self-update role exposure, unhashed update passwords, token-only role/status checks, sensitive logs, upload-target handling and property status timestamps are unresolved cleanup findings.
- Typechecks/builds passed during the rename; lint failed on a pre-existing missing `typescript-eslint` import. Full database-backed e2e tests were not run. See [COMPLETED_TASKS.md](COMPLETED_TASKS.md).

