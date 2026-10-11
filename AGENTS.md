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
- Product statuses: DRAFT, ACTIVE, ARCHIVED; default DRAFT. Removal archives rather than physically deleting.
- Sale units: DONA (dona), QOP (qop), METR (metr), KG (kilogramm). Whole DONA/QOP; metric units allow up to three decimals.
- Price is integer UZS so‘m, validated by WholeSom, not GraphQL Int. Stock quantities start at zero and are excluded from catalog inputs.
- No Board/Follow features or product ownership counters. Retain member/product social interactions with discriminator-aware references.
- Future commerce: agents confirm payments, PENDING → COMPLETED. Payment completion is independent of fulfillment and full debt settlement.
- Orders, payments, stock receipts, debt and delivery services are not implemented in the catalog milestone. Do not silently broaden agent permissions when adding them.

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
