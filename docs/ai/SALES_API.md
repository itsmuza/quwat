# Offline Sales API

Implemented 2026-10-13. These operations record payment received in the store; they do not charge a bank card. Existing Nest GraphQL/Mongoose architecture is retained.

## Operations and permissions

| Operation | Active role | Input/result |
| --- | --- | --- |
| requestSale | CLIENT | RequestSaleInput → Sale |
| cancelSale | CLIENT | SaleIdInput → own Sale |
| getMySales | CLIENT | SalesInquiry → paginated own Sales |
| approveSale | AGENT | SaleIdInput → Sale |
| rejectSale | AGENT | SaleIdInput → CANCELLED Sale (reservation release) |
| getSaleNotifications | AGENT | OrdinaryInquiry → SaleNotifications (list, metaCounter, unreadCount) |
| getSaleForAgent | AGENT | SaleIdInput → exact Sale, including final requests |
| markSaleNotificationRead | AGENT | SaleIdInput → Boolean; per-authenticated-agent first read |
| getPendingSales | AGENT | OrdinaryInquiry → pending Sales, oldest first |
| getAllSalesByAdmin | ADMIN | AdminSalesInquiry → paginated Sales |
| getDailySalesByAdmin | ADMIN | DailySalesInput → DailySalesReport |

Guest, BLOCK/DELETE members and other roles are denied at guard and service boundaries. Member identity/agent identity comes from authentication, never request inputs.

## Input example

```graphql
mutation Request($input: RequestSaleInput!) {
  requestSale(input: $input) { _id requestKey saleStatus totalAmount createdAt }
}
```

```json
{
  "input": {
    "requestKey": "b9809a2c-b085-4b3f-b9fc-f2a849cfe5a2",
    "paymentMethod": "CASH",
    "expectedTotal": 75000,
    "items": [{
      "productId": "607f1f77bcf86cd799439013",
      "quantity": 1,
      "expectedUnitPrice": 75000,
      "expectedProductUnit": "METR"
    }]
  }
}
```

The ID is illustrative. Request requires 1–100 unique products, UUIDv4 requestKey, CASH/CARD, safe non-negative integer WholeSom prices/total, positive quantities at most 1e9 with up to three decimals. DONA/QOP quantities must be whole; all units obey current minimum and step. Expected unit/price and computed total must match the server. No product owner/stock/member input is accepted.

SalesInquiry uses page >= 1, limit 1–100 and optional saleStatus PENDING/COMPLETED/CANCELLED. AdminSalesInquiry additionally accepts optional date YYYY-MM-DD, filtering completionDate. DailySalesInput has optional date; omitted date is today's Asia/Tashkent day. Invalid calendar dates are rejected; future valid days return an empty report. getDailySalesByAdmin returns date, salesCount, totalAmount and products (productId, productName, productUnit, quantity, totalAmount). Only COMPLETED sales count.

## Stored state and stock

The sales collection has a unique clientId/requestKey index and stores item name/type/unit/brand/image, unitPrice, quantity and rounded lineTotal. Internal requestHash and quantityMilli are not GraphQL fields. UTC timestamps accompany client/agent name snapshots and completionDate.

Request atomically reserves each product and inserts PENDING. Approval atomically records COMPLETED and decrements productQuantity/productReservedQuantity. Cancellation atomically records CANCELLED and decrements reservations only. No automatic expiry or completed-sale reversal. Existing pending snapshots may be approved after catalog archival or price/name changes; consistent stock/reservation and unchanged unit are still required.

Requests canonicalize IDs/keys and hash sorted items plus payment method and expected amount/unit. Same member/key/identical payload returns the original sale in any state, with original timestamps. Different payload conflicts. Same final decision retries are idempotent; contrary decisions conflict. Frontend persists unknown-response intent and disables editing until the same request is acknowledged or definitively rejected.

Line amount uses integer milli-units and BigInt: round quantity × whole-so‘m price half upward to nearest whole so‘m. Total sums rounded lines; unsafe amounts are rejected. Reports sum stored snapshots, preserving history across product edits.

## Infrastructure and verification

All multi-document writes use Connection.transaction with snapshot read concern, majority write concern, primary reads and explicit sessions; product operations execute sequentially. MongoDB must support transactions (replica set or supported sharded deployment). Standalone transaction rejection is surfaced clearly; there is no non-atomic fallback. No environment URI/topology was changed. See [Mongoose transactions](https://mongoosejs.com/docs/transactions.html).

Unit/GraphQL tests use isolated mocks. Browser fixtures use the actual SaleService with in-memory transactional models. They verify workflow/rounding/permissions/idempotency/rollback and serialized conflicts, but do not replace real MongoDB race/index/rollback integration checks. Run those only against an explicitly selected isolated replica set. No live sales, stock or payments were changed by development tests.

Stock receipts, CREDIT/debt/repayments, delivery, online payment gateway and refunds remain unimplemented.

## Agent notification inbox — 2026-10-16

Implemented after explicit user approval for frontend/backend changes. Existing persisted sales are the durable notification source, including still-pending requests made while agents are offline. Inbox list is newest-first (createdAt DESC, _id DESC) and, as requested on2026-10-16, contains only PENDING requests. The PENDING filter runs before read-marker lookup, pagination, total and unread counting; frontend shows one scrollable list without pagination controls. Requests use the existing API in batches of at most100, and remaining batches load automatically; the backend pagination contract is unchanged. Approval, agent rejection or client cancellation removes the request from notifications without deleting its persisted sale/history. Exact getSaleForAgent links remain valid for final receipts. Separate sale_notification_reads stores agentId/saleId/readAt; unique pairs, index readiness and insert-only upserts preserve first-read time and isolate agents. Agents may read final safe Sale snapshots through these APIs. No caller-supplied member ID or bulk mark-read is accepted.

rejectSale is ACTIVE AGENT-only. It runs the same transactional reservation release as cancellation, stores rejectedAt/rejectedById/rejectedByName and moves PENDING to CANCELLED without reducing total stock. Repeating an existing agent rejection preserves the original decision. COMPLETED cannot be rejected, and a client-cancelled request is not relabelled as agent rejection. No reversal/refund API was added.

After committed request/approval/cancellation/rejection, existing raw WebSocket connections for current authenticated ACTIVE AGENT members receive only `{ event: 'saleChanged' }`. The gateway revalidates token expiry and current database role/status before sending. This carries no customer/payment payload and only prompts authenticated GraphQL reads.15-second visible-tab polling plus focus/socket-open refresh recovers missed hints. Chat wire events are unchanged.

Navbar bell opens a right-side modal drawer; profile icon remains next to it. Exact request links use `/mypage?category=payments&saleId=<id>` and getSaleForAgent so an already-final or non-first-page request opens correctly. Panel approve/reject use confirmation dialogs and pending-action locks. Anonymous/CLIENT/ADMIN do not mount the notification query/UI.

Verified with47 isolated backend tests and17 frontend notification/account/cart tests, typechecks/lint/build checks and11 documents validated against the running localhost GraphQL schema. Browser action checks used mock requests; no live sale/payment/stock mutation was performed for validation. True replica-set concurrency remains a separate isolated integration check.
