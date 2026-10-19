# ADMIN permanent deletion

Implemented 2026-10-16 at the user’s explicit request. Existing product archive and member DELETE status operations remain unchanged.

```graphql
mutation DeleteProduct($productId: String!) {
  deleteProductPermanentlyByAdmin(productId: $productId)
}
mutation DeleteMember($memberId: String!) {
  deleteMemberPermanentlyByAdmin(memberId: $memberId)
}
```

Both require a current ACTIVE ADMIN through RolesGuard and repeat the actor check in the service. Target IDs must be 24 hexadecimal characters. They return true on committed deletion or an already absent target, permitting safe retries. Self-deletion and deletion of any ADMIN account are forbidden.

## Product

Reject any nonzero productReservedQuantity or PENDING sale containing the product. Delete the product, target PRODUCT likes/guest likes/views/comments and saved-product links in one MongoDB transaction. The product deletion conflicts with concurrent reservation writes to the same product; transactions use snapshot read concern, majority write concern and primary preference. Remaining unreserved stock may be discarded by this explicit deletion, so the frontend names the record and requires typing its exact displayed name.

## Member, including AGENT and CLIENT

Delete the account; MEMBER-target social rows; its authored likes/views/comments; saved links; and agent notification-read markers in the same transaction. Adjust surviving social target counters, with a floor of zero; previously deleted comments do not decrement twice. Member DELETE status is not a prerequisite. Missing accounts cannot pass existing login/token checks.

## Retained history and files

Sales are never deleted or rewritten. Their immutable client/agent names, item names, quantities, prices and images remain the source for history/reports. A deleted client’s pending request remains reviewable by an agent; deletion does not implicitly approve, cancel or release that sale’s reservation.

Attendance records remain keyed by memberId. Existing all-history/admin notification queries retain rows with missing member data and use ID fallback; current rosters omit missing agents. The selected-agent calendar requires an existing member and cannot reconstruct a deleted agent’s profile or enrollment.

Shared uploaded files and existing in-memory public chat messages are retained, because historical receipts/messages can reference them. This is catalog/account deletion with related live social cleanup, not erasure of every historical mention or media file.

## Frontend and validation

Buttons appear on admin product cards and non-admin user/agent cards. A dialog explains irreversibility, requires the exact displayed name, locks duplicate submissions/dismissal while submitting and preserves errors/input for retry. Successful deletion evicts affected cache entries and refetches/clamps the list. Text is translated across UZ/EN/RU/KR.

Requires MongoDB transactions (replica set or supported sharded topology), as existing sales already do. Unsupported topology fails closed; there is no partial nontransactional fallback. Isolated storage/GraphQL/React tests cover permissions, input, cleanup, rollback, counters, retries and reserved products. Real MongoDB race validation is separate. Browser actions used mock records only; no live deletion was executed for validation.
