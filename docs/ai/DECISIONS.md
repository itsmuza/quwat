# Quwat Decisions

Updated: **2026-10-13**, Asia/Seoul. Latest user-approved Product, Saved, Attendance and offline Sales milestones override the earlier migration proposals.

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
| Admin manual stock entry | Initial quantity at create; total quantity update requires expectedProductQuantity; reservations protected; additive receipts deferred |
| No product member attribution | One admin; products store no creator/updater member reference |
| Anonymous product/agent likes | Separate guest_likes identity, retry-safe set/unset and shared counters; ACTIVE products/AGENT members only; account permissions unchanged |
| Preserve member/product likes/views/comments | Group-aware references/indexes, ACTIVE catalog visibility |
| Independent saved products | Active CLIENT-only APIs; saved_products unique member/product pairs; no cart, stock, social counter or ranking effects |
| Archived saved cards remain visible | Saved lists include ACTIVE/ARCHIVED, hide DRAFT/missing; links survive status changes; Product.meSaved is computed |
| Agent attendance with admin review | AGENT requests today and reads only self; ADMIN reviews PENDING and reads history/daily roster; CLIENT denied |
| Attendance day and absence | Asia/Tashkent server date; every calendar day from attendanceStartDate counts; missing requests yield computed ABSENT, not stored records |
| Persistent agent sale notifications | Existing sales form the durable inbox; per-agent read markers; role-checked socket hints and polling; ACTIVE AGENT can reject PENDING requests transactionally without reducing stock |
| Offline sales and stock reservations | CLIENT request/cancel, AGENT CASH/CARD receipt approval, ADMIN history/daily revenue; immutable snapshots and idempotent transactional stock changes |
| Explicit ADMIN permanent deletion | Separate hard-delete mutations for catalog/non-admin accounts; typed frontend confirmation, transactional social cleanup, protected reservations/admins and preserved sales/attendance |
| Remove Board and Follow | Obsolete modules, types, references and member counters removed |
| Auth repair precedes domain migration | Await password check, hashed updates, profile/admin input separation, live role/status checks |
| Repair lint without dependency upgrade | Use already installed TypeScript parser/plugin; lint no longer auto-fixes |

Minimum and step default to 1 for DONA/QOP and 0.001 for METR/KG. Minimum is a positive multiple of step. Stock/minimum/step upper bound is 1,000,000,000. Unit changes require stock and reservations equal to zero. Public catalog/favorites/visited show only ACTIVE products, including zero-stock cards. Default catalog sort is createdAt DESC and limit is 1–100.

Saved API: saveProduct(productId) and unsaveProduct(productId) return true on success, including repeated valid operations. New saves require an ACTIVE product even with zero stock; unsave does not require the product to still exist. getSavedProducts uses OrdinaryInquiry (page >= 1, limit 1–100), first-save createdAt DESC then saved-record _id DESC, and counts only visible cards. Retry-safe saves await the unique index and do not move existing cards to the top. Product.meSaved is false for anonymous/non-client members; saved records are never imported from likes.

## Attendance

Attendance APIs are implemented in the working tree: requestAttendance, reviewAttendance, getMyAttendances, getAllAttendancesByAdmin, getDailyAttendancesByAdmin. Requests store only PENDING/APPROVED/REJECTED. Only APPROVED counts as present; PENDING awaits review and REJECTED is final. No resubmission after rejection or reversal of final decisions. Admin may review older pending requests. Request retries preserve original timestamps; identical review retries preserve decision time.

Existing agents need the explicit initialization script before requests/calendar/daily reports. It sets attendanceStartDate only when missing; new AGENT assignments set it atomically and preserve it thereafter. Personal calendars clip to enrollment/today and generate missing days; admin request history returns actual stored records, while daily reports include current ACTIVE/BLOCK agents, exclude DELETE and later-enrolled agents, and expose only safe identity. They do not reconstruct historical employment intervals. Frontend/setup execution/isolated MongoDB concurrency validation remain separate; see ATTENDANCE_API.md.

## Production preparation — 2026-10-17

The user explicitly chose a new database in the existing Atlas cluster and a full copy of current Quwat data, overriding the earlier fresh-empty-database default. Quwat remains development; quwat_prod is the independently verified snapshot. Scoped application users, private environment files and a separate production signing secret are configured. Production hosting remains separate. See PRODUCTION_DATABASE.md.

## Future requirements

- One store and shared warehouse, no marketplace.
- Clients initiate the implemented PENDING sale requests; see SALES_API.md. Broader order/fulfillment workflows remain separate.
- Admin-only additive receipts: existing 10 + received 100 = 110, with reservation preservation, history and idempotency.
- Agent offline CASH/CARD confirmation is implemented: PENDING → COMPLETED. No catalog ownership or broader debt/fulfillment permissions.
- Offline CREDIT remains future work; CASH/CARD receipt records are implemented. No online payment gateway.
- Interest-free debt, due date and partial repayments. Completed payment is a receipt state, independent of remaining debt and fulfillment.
- Pickup or free delivery; no completed-sale return/refund workflow.
- No Nestar data/account import. The user-approved current Quwat database copy is completed; production hosting remains separate and no deletion of old databases is authorized.

## Retained planning defaults for later commerce

Sales now implement per-line nearest-whole-so‘m rounding, half upward; sum rounded lines; reserve on request; no automatic reservation expiry; and client cancellation before approval. Debt and fulfillment remain separate future contracts.

## Superseded and unresolved

Superseded: agent-owned products, agent product editing, subtype enum/list, per-variant SKU requirement, memberProducts ranking, old Property API compatibility aliases, Board/Follow retention and agent order/debt/fulfillment permissions inferred from early discussions.

Resolve in later tasks: isolated MongoDB integration/deployment validation; incoming-stock API and transaction contract; actual MongoDB sale transaction/race validation; payment corrections; debt/fulfillment permissions; frontend migration. Upload target validation remains a separate pre-existing issue.
