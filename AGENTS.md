# QUWAT Backend Agent Instructions

Quwat is a NestJS GraphQL/Mongoose monorepo for one construction-materials store, migrated from a real estate platform.

## Read First

Read `SKILLS.md` and the current AI handoff documents before development:

- `docs/ai/BACKEND_MIGRATION.md`
- `docs/ai/DECISIONS.md`
- `docs/ai/COMPLETED_TASKS.md`
- `docs/ai/NEXT_STEPS.md`

These documents distinguish implemented behavior from future commerce requirements. Explicit user instructions take precedence.

## Project Shape

- Apps: `quwat` and `quwat-batch`.
- Preserve the NestJS resolver/service/module pattern and dependency injection.
- DTOs, enums, schemas and validators live under `apps/quwat/src/libs`.
- Retain shared auth, member, like, view, comment and socket functionality.

## Domain Rules

- Catalog entity: Product, MongoDB collection: `products`. Do not restore housing fields or compatibility aliases.
- Member types: `CLIENT`, `ADMIN`, `AGENT`. Public signup always creates CLIENT; role/status management is admin-only.
- Separate permanent member deletion protects self and all ADMIN accounts, removes live social/saved/read-marker data and reconciles surviving counters. Preserve sales and attendance history; this is not a purge of historical mentions. See docs/ai/ADMIN_DELETION_API.md.
- Admin member lists exclude the authenticated administrator by ObjectId before pagination/counting. Do not accept caller identity from list input; retain other members and existing filters.
- Only active ADMIN members create, edit, archive or restore products. Agents do not own or manage products.
- The store has one admin; Product has no member attribution fields. Keep ADMIN authorization for all catalog writes.
- Product names are free text and unique across all statuses after trimming (case-sensitive). Use `_id` for references; no SKU or subtype field/enum.
- Product types:
  - `ASBOBLAR` — Asboblar
  - `MAHKAMLASH_BUYUMLARI` — Mahkamlash buyumlari
  - `SANTEXNIKA` — Santexnika
  - `ELEKTR_MOLLARI` — Elektr mollari
  - `BOYOQ_VA_YELIMLAR` — Bo‘yoq va yelimlar
  - `ESHIK_JIHOZLARI` — Eshik jihozlari
  - `XOJALIK_BUYUMLARI` — Xo‘jalik buyumlari
- Product statuses: DRAFT, ACTIVE, ARCHIVED; default DRAFT. removeProductByAdmin archives. Separate explicit ADMIN-only permanent deletion removes the product and live social/saved links transactionally; deny reserved stock or pending sales. Never purge sale snapshots or shared uploaded files. See docs/ai/ADMIN_DELETION_API.md.
- Sale units: DONA (dona), QOP (qop), METR (metr), KG (kilogramm). Whole DONA/QOP; metric units allow up to three decimals.
- Price is integer UZS so‘m, validated by WholeSom, not GraphQL Int. ADMIN may supply initial productQuantity on create (default zero) and set total stock on update with expectedProductQuantity matching the current value. Validate unit/precision/bounds, preserve reservations and never allow total below reserved quantity. productReservedQuantity remains server-controlled and absent from inputs.
- No Board/Follow features or product ownership counters. Retain member/product social interactions with discriminator-aware references.
- Anonymous likes are limited to ACTIVE products and ACTIVE AGENT targets through setGuestLike; persist separate guest_likes UUID hashes and update guest records/counters transactionally. Never use a guest ID as member identity or relax authenticated saved/cart/attendance/sale guards. See docs/ai/GUEST_LIKES_API.md.
- Saved products are separate from likes/favorites and carts. Only active CLIENT members use saveProduct, unsaveProduct and getSavedProducts; identity comes from auth. Keep member/product pairs unique in saved_products and preserve first-save timestamps on retries.
- Saved lists show ACTIVE and ARCHIVED products (status indicates unavailability), hide DRAFT/missing products and retain links across status changes. Product.meSaved is computed for the current client, never stored on Product. Saving/listing must not change stock, social counters or ranking.
- Attendance uses Asia/Tashkent calendar dates. Active AGENT members request today's attendance/read their own calendar; active ADMIN members review requests/read all request history, the current-agent daily report and a selected agent calendar through getAgentAttendancesByAdmin. CLIENT has no access. Only APPROVED means present; ABSENT is computed for days without a request, never stored.
- Keep attendance member/date pairs unique; retries cannot reopen final decisions or change first-request/decision times. ADMIN may review older PENDING requests; final decisions cannot be reversed.
- attendanceStartDate is server-controlled: initialize existing agents with the separate explicit setup script; assign it atomically on first AGENT role assignment and never overwrite it. No pre-start/future ABSENT days; all calendar days count. Missing setup is an error. Daily reports include BLOCK agents, exclude DELETE/non-AGENT members; historical requests remain readable by ADMIN.
- Sales are persisted in sales: active CLIENT requests reserve stock atomically, active AGENT confirms offline CASH/CARD receipt, and active ADMIN reads history/daily reports. PENDING → COMPLETED decrements total and reserved stock; CLIENT may cancel only own PENDING requests to release reservations. Final transitions and request keys are idempotent.
- Preserve immutable item/price/quantity snapshots and Asia/Tashkent completion dates. Use multi-document transactions with explicit sessions; MongoDB must support transactions. See docs/ai/SALES_API.md.
- Cart is client-scoped browser state. No online gateway, CREDIT/debt, fulfillment, additive stock receipts or completed-sale refunds are implemented; do not infer additional agent permissions.

## Workflow

1. Inspect current code and working tree before editing; preserve user changes.
2. Keep changes consistent with existing project patterns.
3. Replace related references together, including social modules and batch ranking.
4. Update `docs/ai/COMPLETED_TASKS.md` after major completed work.
5. Add focused behavioral tests for changed permissions, validation and data flow.
6. Never connect tests to deployment databases or change environment URI values without an explicit deployment task.

## Validation

```bash
npx tsc --noEmit --incremental false -p apps/quwat/tsconfig.app.json
npx tsc --noEmit --incremental false -p apps/quwat-batch/tsconfig.app.json
npm test -- --runInBand
npm run lint
npm run build -- quwat
npm run build -- quwat-batch
git diff --check
```

Build sequentially because Nest uses a shared output directory. `npm run lint` does not rewrite files.
