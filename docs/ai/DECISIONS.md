# Quwat Decisions

Updated: **2026-10-11**, Asia/Seoul. Latest user-approved Product milestone overrides the earlier migration proposals.

## Implemented

| Decision | Result |
| --- | --- |
| Preserve NestJS GraphQL/Mongoose architecture | API and batch remain in the existing monorepo |
| Product replaces the housing catalog | Product schemas, DTOs, operations, filters and batch references |
| Roles CLIENT, ADMIN, AGENT | USER removed; public signup always CLIENT |
| ADMIN alone manages products | Agent/client writes denied; the store has one admin |
| Shared store catalog without agent ownership | No product memberId, owner lookups, agent catalog API or memberProducts counter |
| No SKU and no subtype | productName is free text and unique after trimming across all statuses (case-sensitive); `_id` is identity |
| Seven Uzbek product types | ASBOBLAR, MAHKAMLASH_BUYUMLARI, SANTEXNIKA, ELEKTR_MOLLARI, BOYOQ_VA_YELIMLAR, ESHIK_JIHOZLARI, XOJALIK_BUYUMLARI |
| DRAFT/ACTIVE/ARCHIVED lifecycle | Default DRAFT; removal archives; restoration clears archive date |
| DONA/QOP/METR/KG units | Whole packaged units; metric units support three decimals |
| Whole UZS so‘m | WholeSom scalar, non-negative safe integer; no tiyin |
| Catalog inputs cannot write stock | Both quantities start at zero; stock receipts deferred |
| No product member attribution | One admin; products store no creator/updater member reference |
| Preserve member/product likes/views/comments | Group-aware references/indexes, ACTIVE catalog visibility |
| Remove Board and Follow | Obsolete modules, types, references and member counters removed |
| Auth repair precedes domain migration | Await password check, hashed updates, profile/admin input separation, live role/status checks |
| Repair lint without dependency upgrade | Use already installed TypeScript parser/plugin; lint no longer auto-fixes |

Minimum and step default to 1 for DONA/QOP and 0.001 for METR/KG. Minimum is a positive multiple of step. Stock/minimum/step upper bound is 1,000,000,000. Unit changes require stock and reservations equal to zero. Public catalog/favorites/visited show only ACTIVE products, including zero-stock cards. Default catalog sort is createdAt DESC and limit is 1–100.

## Future requirements

- One store and shared warehouse, no marketplace.
- Clients alone initiate orders. Cart/order APIs are not shipped.
- Admin-only additive receipts: existing 10 + received 100 = 110, with reservation preservation, history and idempotency.
- Agents confirm payments: PENDING → COMPLETED. This is their sales permission; do not infer catalog ownership or broader order/debt/fulfillment permissions.
- Offline CASH/CARD/CREDIT; no online payment gateway.
- Interest-free debt, due date and partial repayments. Completed payment is a receipt state, independent of remaining debt and fulfillment.
- Pickup or free delivery; no completed-sale return/refund workflow.
- No legacy data/account import. Fresh database setup and initial admin provisioning are deployment tasks; no deletion of old databases is authorized.

## Retained planning defaults for later commerce

These are not implemented by the catalog milestone: per-line nearest-whole-so‘m rounding, half upward; sum rounded lines; reserve on order creation; no automatic reservation expiry; cancellation before payment/credit/handover; independent payment, debt and fulfillment state. Review these when defining the commerce contract.

## Superseded and unresolved

Superseded: agent-owned products, agent product editing, subtype enum/list, per-variant SKU requirement, memberProducts ranking, old Property API compatibility aliases, Board/Follow retention and agent order/debt/fulfillment permissions inferred from early discussions.

Resolve in later tasks: isolated MongoDB integration/deployment validation; incoming-stock API and transaction contract; cart/order state transitions; payment confirmation eligibility/idempotency, amount accounting and other-role access; payment corrections; debt/fulfillment permissions; frontend migration. Upload target validation remains a separate pre-existing issue.
