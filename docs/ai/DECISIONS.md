# Migration Decisions

Snapshot: **2026-10-11**, Asia/Seoul. Status means **implemented**, **explicit future requirement**, **planning default**, or **superseded**; discussion does not imply shipped functionality.

## Implemented milestone decisions

| Decision | Why | Risks / alternative |
| --- | --- | --- |
| Separate safe rename from business migration | User explicitly approved a rename-only milestone | Shipping Product/CLIENT or a bug fix in that diff would violate scope; alternative was one large domain refactor |
| Rename package/apps/batch identifiers to Quwat | Consistent build, deployment and visible project identity | External scripts may still reference old paths; update them without changing API contracts |
| Keep APIs, domain behavior and MongoDB collections unchanged | Existing consumers and database selection must continue to work | Backend is still real-estate-based despite branding; alternative is a coordinated breaking release |
| Keep environment keys, URI values and batch constants | No branded keys/constants were found; URI substitution could select another database | Old brand can remain inside a connection value; use an explicitly configured new database in the later phase |
| Preserve dependencies and user edits | Rename requires no upgrades or unrelated changes | Existing tooling/auth defects remain; repair them separately |
| Run lint without autofix and report baseline failure | Broad rewriting was excluded | Lint is blocked by missing `typescript-eslint`; alternative is a separately scoped tooling repair |

## Agreed future product decisions

| Decision | Reason | Risk / alternative |
| --- | --- | --- |
| Keep the NestJS GraphQL/Mongoose monorepo | Existing platform foundation can be reused | Batch imports currently couple it to the API; extract shared libraries instead of introducing microservices |
| One store, shared catalog and warehouse; no marketplace | User selected one QUWAT store with agents as staff | No independent seller settlement/tenant isolation; alternative was multi-store or marketplace ownership |
| Property → Product throughout the domain/API | Construction materials need quantities/SKUs, not housing fields | Breaking frontend contract; alternative was misleading legacy aliases, which is superseded |
| USER → CLIENT, retain AGENT and ADMIN | User selected customer terminology and agent-driven sales | Update role defaults, guards, generated types and token handling together |
| Agents sell; clients alone create orders | User chose client-created orders and agent confirmation | No agent-created walk-in order workflow; alternative was agent/client dual entry |
| Admin inspects/updates data and receives stock | Incoming goods must add to warehouse quantities | Ordinary product updates must not overwrite stock; alternative is unrestricted stock editing |
| Stock receipts are additive and recorded | Explicit example: 10 existing + 100 received = 110 | Duplicate requests/concurrent writes can corrupt totals; use atomic increment, transaction and idempotency |
| Four units only: dona, qop, metr, kg | User narrowed the allowed list | Tonnes, m² and m³ are excluded; conversions are not in scope |
| Integer so‘m for all money | User explicitly rejected tiyin | Fractional quantities require a documented rounding policy; alternative was minor-unit pricing, now superseded |
| Offline CASH, CARD and CREDIT sales | Buyers pay at the store; platform records receipts | Recording a card receipt does not verify a bank settlement; no gateway/terminal integration |
| Interest-free debt with due date and partial payments | User chose debt accounting and partial upfront/repayment options | Approval/late-debt operations need clear access controls; alternative was a CREDIT label without a ledger or installment schedule |
| Free delivery plus pickup | User explicitly set delivery fee to zero | Logistics costs remain outside customer charging; manual/flat/zone delivery tariffs are superseded |
| No completed-sale return/refund workflow | User explicitly excluded returns | Cancellation must be distinguished from returns; payment-entry correction is a separate unresolved workflow |
| No legacy properties, accounts or IDs need importing | User removed data-retention requirements | Old identities/sessions will not carry into the future new database; no destructive database operation is implied |
| Remove Board and Follow completely | User excludes community articles and subscriptions | Dependencies exist in Member, Comment, enums and ranking; deleting only feature folders would break compilation |

## Planning defaults, not independently confirmed policies

These defaults appeared in the migration plans. Revisit them only through an explicit contract/business change; they are not implemented.

| Default | Purpose | Risk / alternative |
| --- | --- | --- |
| Whole dona/qop; metr/kg up to three decimals | Deterministic quantity validation | Actual product packaging may need another step; allow product minimum/step within these units |
| Round each line to nearest whole so‘m, half upward; sum lines | Keep every monetary amount in whole so‘m | Total-first rounding differs; cover examples in shared backend/frontend contract tests |
| One sold variant per SKU; DRAFT/ACTIVE/ARCHIVED products | Manage stock independently and allow replenishment | More SKUs than a parent/variant system; zero stock must not become permanent SOLD |
| Reserve stock when an order is created; no automatic expiration | Prevent parallel overselling | Pending orders can hold stock indefinitely; manual cancellation/release is the current default |
| Cancel only before payment/credit formalization and handover; client only while PENDING | Keep cancellation separate from excluded refunds | Exact correction cases need review before commerce implementation |
| Separate fulfillment completion from debt settlement | Delivered goods can still be unpaid on credit | A single status would hide liabilities; introduce independent payment/debt state |
| Multi-document transactions and idempotency | Keep receipt/order/debt/stock changes consistent | Requires compatible MongoDB deployment and contention/retry tests |
| Retain product/member Like/View/Comment | Preserve functions not excluded by the user | Target moderation/ranking details remain to be specified; ARTICLE branches must be removed |

## Superseded proposals

Do not implement these earlier discussion branches: admin-only selling; independent-agent marketplace; preserving old accounts/IDs; Property API compatibility aliases during the domain cutover; catalogue-only scope; paid delivery; tiyin pricing; tonne/m²/m³ sale units; online payment integration; Board/Follow retention in the target domain.

The current safe rename preserves those legacy modules/APIs **temporarily**. That is a milestone scope boundary, not a reversal of the future commerce decisions.

## Open decisions and implementation checks

- Frontend naming: the latest documentation request mentions **Petoria**, while all preceding project decisions use **Quwat**. See the explicit naming note in [FRONTEND_MIGRATION.md](FRONTEND_MIGRATION.md); do not infer a pet-commerce domain.
- No Next.js source is present here. Locate its repository and confirm actual routes/router version, components, GraphQL client, codegen and auth storage before implementation.
- Choose money/quantity transport types and maximum values before schema generation; integer currency does not by itself define the wire representation.
- Finalize agent order assignment/conflict handling, debt approval data, payment-entry corrections, SKU immutability and product-unit changes once stock/history exist.
- Choose operational timezone, overdue notification behavior and idempotency keys for new jobs. Existing cron schedules remain unchanged today.
- Notification/Notice are schemas, not completed features. Do not promise notifications until their services and delivery channels are scoped.

