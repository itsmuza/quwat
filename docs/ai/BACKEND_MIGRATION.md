# Backend Migration: Nestar → Quwat

Updated: **2026-10-11**, Asia/Seoul. Project rename and the approved Product catalog milestone are implemented in the working tree. No deployment, database migration or commit was performed by this implementation.

## Current architecture

NestJS GraphQL/Apollo + Mongoose monorepo: API `quwat`, scheduled app `quwat-batch`. Existing resolver/service/module architecture, member profiles, auth, uploads, socket, likes, views and comments remain. Board and Follow components and their dependencies are removed.

The earlier rename milestone was recorded in commit `10ae5e3`. Its historical validation is retained in COMPLETED_TASKS.md.

## Implemented catalog

- MongoDB `products`; Product replaces the real-estate entity throughout API, schemas, DTOs, filters, social references and batch jobs.
- MemberType CLIENT, ADMIN, AGENT. Only active ADMIN members manage products; no agent ownership or member product counter.
- productName is free text, trimmed to 3–100 characters; unique across all statuses after trimming, with case-sensitive comparison. References use `_id`. No SKU or subtype.
- Seven ProductType values are declared in `apps/quwat/src/libs/enums/product.enum.ts` and AGENTS.md.
- Status DRAFT (default), ACTIVE, ARCHIVED. removeProductByAdmin archives idempotently; updateProduct restores and clears archivedAt.
- Units DONA/QOP use whole quantities; METR/KG allow three decimal places. Default minimum/step is 1 or 0.001 respectively. Minimum must be a multiple of step; quantities are bounded at 1,000,000,000.
- WholeSom scalar accepts non-negative integer UZS up to Number.MAX_SAFE_INTEGER, including prices above GraphQL Int's range.
- productQuantity and productReservedQuantity start at zero, excluded from create/update inputs. No receipt operation yet.
- The store has one admin; products have no creation/update member attribution fields. ADMIN authorization remains required for catalog writes.
- Unit changes require zero stock and reservations; omitted minimum/step reset to the new unit defaults. Updates detect concurrent changes to dependent fields.

## Authentication

Login awaits bcrypt comparison. Public signup forces CLIENT and exposes no role input. MemberUpdate is profile-only; AdminMemberUpdate adds required member ID and optional role/status. Password changes are hashed in both paths. JWT carries only member ID and expiry; guards fetch the current ACTIVE member and role. JWT configuration loads through ConfigService. Request/response payloads, passwords and tokens are not logged.

## API and social behavior

Public getProduct/getProducts return only ACTIVE cards. Authenticated favorites/visited also filter ACTIVE before pagination/counting. Admin list supports all statuses. createProduct/updateProduct/removeProductByAdmin are ADMIN-only. Both old update paths are unified into updateProduct; agent catalog APIs have no replacement.

Catalog filters: typeList, unitList, brandList, pricesRange, periodsRange, inStock and literal name text. inStock compares total minus reserved quantity. Pagination is 1–100; default createdAt DESC.

Like/View groups and unique indexes include MEMBER/PRODUCT discriminator. Comment search includes commentGroup to isolate targets; comment author references remain. Product comment creation requires an ACTIVE target. Soft deletion and admin removal adjust active comment counters once. Notification productId replaces the old catalog reference; article references are removed. Notification/Notice feature services still do not exist.

Batch schedules remain 01:00:00 rollback, 01:00:20 product ranking, 01:00:40 agent ranking. Product rank = likes × 2 + views; agent rank = memberLikes × 2 + memberViews.

## Database and compatibility

ProductUnit is now DONA, QOP, METR, KG in stored documents, GraphQL outputs/inputs and filters. KG remains the kilogram abbreviation. Existing Product documents with English unit values need a data conversion before using the new API; changing the enum does not rewrite MongoDB. No database conversion was executed by this task. For an explicitly selected Quwat database, the following mongosh commands preserve quantities and other fields and can be rerun safely:

```javascript
db.products.updateMany({ productUnit: 'PIECE' }, { $set: { productUnit: 'DONA' } });
db.products.updateMany({ productUnit: 'BAG' }, { $set: { productUnit: 'QOP' } });
db.products.updateMany({ productUnit: 'METER' }, { $set: { productUnit: 'METR' } });
```

Product name writes await a unique productName index. Existing duplicate names prevent index creation and block create/rename operations with a clear conflict error until the duplicates are resolved. The application does not delete or merge existing records. MongoDB duplicate-key errors on create/rename are mapped to a name-conflict response.

Use a fresh Quwat database at deployment; legacy listings/accounts/IDs will not be imported. Environment values and existing databases are untouched. New schema indexes are declarations for that fresh database; no existing index was dropped or synchronized by this task.

This is a breaking GraphQL cutover: old catalog operations/types, USER and Board/Follow are removed. There is no frontend in this repository; see FRONTEND_MIGRATION.md. Initial admin provisioning in the fresh database remains a deployment task; public signup cannot create an admin.

## Future commerce — not implemented

One store, shared catalog and warehouse. Clients initiate orders; admin receives additive stock with history/idempotency. Agent's authorized sales action is confirming a pending payment, which becomes COMPLETED. Earlier assumptions granting agents product management, order confirmation, debt approval or fulfillment updates are superseded; other commerce permissions must be agreed separately.

Offline CASH/CARD/CREDIT, interest-free debt with due date/partial repayment, pickup/free delivery and no completed-sale returns remain future requirements. Payment completion must not automatically close remaining debt or mark delivery completed. Multi-document commerce transactions need replica-set-capable MongoDB.

Current tests run with mocks, real bcrypt, generated GraphQL schema and disconnected Mongoose models. No MongoDB server-backed e2e run occurred; see COMPLETED_TASKS.md for validation.
