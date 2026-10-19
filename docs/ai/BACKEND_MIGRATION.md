# Backend Migration: Nestar → Quwat

Updated: **2026-10-13**, Asia/Seoul. Product catalog, Saved, Attendance and offline Sales APIs are implemented. No deployment or database migration was performed by these feature implementations.

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
- ADMIN may set initial productQuantity at creation (default zero) and replace total stock on update with an expectedProductQuantity concurrency check. Reservations start at zero, are never writable through catalog inputs, and total cannot fall below them. Unit-aware quantity bounds/precision and atomic compare-and-set checks apply. No additive receipt operation/history yet.
- The store has one admin; products have no creation/update member attribution fields. ADMIN authorization remains required for catalog writes.
- Unit changes require zero stock and reservations; omitted minimum/step reset to the new unit defaults. Updates detect concurrent changes to dependent fields.

## Authentication

Login awaits bcrypt comparison. Public signup forces CLIENT and exposes no role input. MemberUpdate is profile-only; AdminMemberUpdate adds required member ID and optional role/status. Password changes are hashed in both paths. JWT carries only member ID and expiry; guards fetch the current ACTIVE member and role. JWT configuration loads through ConfigService. AuthGuard-protected refreshSession renews a valid ACTIVE session for another 30 days on a return visit, without member input or database writes; expired tokens require login. See AUTH_SESSION.md. Request/response payloads, passwords and tokens are not logged.

## API and social behavior

getAllMembersByAdmin excludes the current authenticated administrator before pagination and total counting. Identity comes from RolesGuard/AuthMember, not GraphQL input. Profile access and other users/filters are unchanged.

Public getProduct/getProducts return only ACTIVE cards. Authenticated favorites/visited also filter ACTIVE before pagination/counting. Admin list supports all statuses. createProduct/updateProduct/removeProductByAdmin are ADMIN-only. Both old update paths are unified into updateProduct; agent catalog APIs have no replacement.

Catalog filters: typeList, unitList, brandList, pricesRange, periodsRange, inStock and literal name text. inStock compares total minus reserved quantity. Pagination is 1–100; default createdAt DESC.

Like/View groups and unique indexes include MEMBER/PRODUCT discriminator. Comment search includes commentGroup to isolate targets; comment author references remain. Product comment creation requires an ACTIVE target. Soft deletion and admin removal adjust active comment counters once. Notification productId replaces the old catalog reference; article references are removed. Notification/Notice feature services still do not exist.

Batch schedules remain 01:00:00 rollback, 01:00:20 product ranking, 01:00:40 agent ranking. Product rank = likes × 2 + views; agent rank = memberLikes × 2 + memberViews.

## Anonymous likes — implemented

Anonymous browsers can set/unset likes on ACTIVE products and ACTIVE AGENT members through setGuestLike. Product.guestLiked and Member.guestLiked reflect a UUIDv4 visitor key supplied in x-quwat-guest-id, stored only as a SHA-256 hash in the separate guest_likes collection. Explicit desired state, a unique guest/group/reference index and MongoDB transactions preserve record/counter consistency on retries. Account like/favorite APIs remain authenticated and unchanged; guest state never supplies member identity or grants other roles. Guest likes affect the existing counters/ranking but do not merge into an account on login. See GUEST_LIKES_API.md.

## Database and compatibility

AttendanceModule uses Attendance/Member models directly and the existing AuthModule, without a MemberService dependency or circular import. attendances stores unique memberId/attendanceDate requests with UTC timestamps, PENDING/APPROVED/REJECTED and nullable reviewedAt; ABSENT is not a valid stored status. Calendar dates are server-derived Asia/Tashkent strings. Request upserts await the unique index and only insert fields, preserving first-request times; duplicate-key errors are accepted only after confirming the exact pair. Decisions use a PENDING conditional update; same-decision retries are idempotent, contradictory decisions conflict.

Member attendanceStartDate is internal tracking metadata, absent from GraphQL profile/signup/admin inputs. First AGENT assignment conditionally initializes it atomically with the role; existing dates are preserved. Existing agents require the separately executed scripts/initialize-attendance.cjs command with explicit ATTENDANCE_SETUP_MONGO_URI, without .env auto-loading. The script only sets missing dates to its Tashkent launch day and never creates attendance rows. It was not executed against a database. Missing/invalid setup gives an explicit error in agent requests/calendar and current-agent daily reports.

getAgentAttendancesByAdmin is ADMIN-only, selects a current AGENT by required memberId and reuses the same calendar generator for active/blocked/deleted agent history, without exposing enrollment metadata or writing records. The frontend renders a full selected month, with neutral future/pre-enrollment days.

getMyAttendances synthesizes each calendar day from enrollment to today, clipping supplied ranges and counting/filtering before pagination. getAllAttendancesByAdmin returns actual request history, including records whose member is inactive/changed/missing, with safe nullable identity. getDailyAttendancesByAdmin joins selected-day requests with the current ACTIVE/BLOCK agent roster, excludes DELETE/later-enrolled agents and computes ABSENT; it does not reconstruct past employment membership. Member fields are limited to _id/memberNick/memberFullName. Pending admin queues use the history status filter; no realtime notification, payroll, schedule/GPS or cron was added. See ATTENDANCE_API.md for requests and rollout instructions.

SavedProductModule uses Product/SavedProduct models directly, with no ProductService dependency or circular module imports. The new saved_products collection contains ObjectId memberId/productId references and timestamps. Unique memberId/productId and memberId/createdAt/_id pagination indexes are declared; save operations explicitly await the unique index even when auto-indexing is disabled. Saving uses atomic insert-only upsert with timestamps disabled for that update, preserving first-save times. A duplicate-key race is successful only after confirming the exact saved pair. Failed index creation is retried on a later save.

saveProduct, unsaveProduct and getSavedProducts are active CLIENT-only at resolver/service boundaries. Saved lists return ACTIVE/ARCHIVED cards with current productStatus; DRAFT/missing cards are excluded before pagination and counting, while their links remain. There is no physical Product deletion API; unsave also works for missing cards. Product.meSaved is computed by a field resolver for the authenticated current client and is not a stored field. Existing like/favorites/visited behavior and batch formulas are unchanged. No old like data was migrated. See SAVED_PRODUCTS_API.md for copyable requests.

ProductUnit is now DONA, QOP, METR, KG in stored documents, GraphQL outputs/inputs and filters. KG remains the kilogram abbreviation. Existing Product documents with English unit values need a data conversion before using the new API; changing the enum does not rewrite MongoDB. No database conversion was executed by this task. For an explicitly selected Quwat database, the following mongosh commands preserve quantities and other fields and can be rerun safely:

```javascript
db.products.updateMany({ productUnit: 'PIECE' }, { $set: { productUnit: 'DONA' } });
db.products.updateMany({ productUnit: 'BAG' }, { $set: { productUnit: 'QOP' } });
db.products.updateMany({ productUnit: 'METER' }, { $set: { productUnit: 'METR' } });
```

Product name writes await a unique productName index. Existing duplicate names prevent index creation and block create/rename operations with a clear conflict error until the duplicates are resolved. The application does not delete or merge existing records. MongoDB duplicate-key errors on create/rename are mapped to a name-conflict response.

Production preparation update2026-10-17: the user approved a full current Quwat -> quwat_prod copy in the existing Atlas cluster. Both databases have separate application users and ignored local env files; the source database and original.env were preserved. This copies current Quwat data, not an import from the former Nestar system. See PRODUCTION_DATABASE.md for the snapshot, validation and remaining hosting work.

This is a breaking GraphQL cutover: old catalog operations/types, USER and Board/Follow are removed. There is no frontend in this repository; see FRONTEND_MIGRATION.md. Initial admin provisioning in the fresh database remains a deployment task; public signup cannot create an admin.

## Offline sales — implemented

Active CLIENT sends requestSale with expected prices/units/total and a UUIDv4 requestKey. The server validates current ACTIVE products and stock, stores immutable item snapshots and reserves quantities in one transaction. Same client/key/payload retries return the same record; changed payload conflicts. Active AGENT approves a PENDING sale only after receiving offline CASH/CARD payment. Approval stores the agent and Asia/Tashkent completion day, and decrements both total and reserved quantities. CLIENT cancellation of own PENDING sale only releases reservations. Final states cannot be reversed. ADMIN reads paginated history and completed-day reports; later catalog edits do not rewrite receipts.

See SALES_API.md for inputs, role restrictions, rounding, transaction prerequisites and validation limitations. Browser cart is member-scoped local state; submitted sales persist in MongoDB. No automatic reservation expiry.

## Future commerce — not implemented

Admin additive stock receipts/history/idempotency, CREDIT and debt/partial repayments, independent fulfillment, pickup/free delivery and completed-sale corrections/refunds remain separate tasks. Payment completion does not mark delivery complete. No online payment gateway is implemented.

## Public chat — refreshed 2026-10-16

The existing raw WebSocket public room retains its last 50 messages in API process memory. Message validation, safe public identity, per-send authenticated status checks, message IDs/timestamps and reconnect-aware frontend behavior are implemented. No durable chat database storage or private messaging was added. Existing saleChanged hints are preserved. See CHAT_API.md for the protocol and limits.

## Explicit permanent deletion — 2026-10-16

Dedicated ADMIN-only mutations now hard-delete products and non-admin member accounts with transactional cleanup. Product reservations/pending sales prevent deletion; self and ADMIN accounts are protected. Sales snapshots and attendance documents survive; shared uploads are retained. Existing archive and DELETE status operations keep their previous behavior. See ADMIN_DELETION_API.md.
