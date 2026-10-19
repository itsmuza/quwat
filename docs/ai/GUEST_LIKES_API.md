# Anonymous product and agent likes

Updated: **2026-10-16**, Asia/Seoul.

Anonymous visitors may like ACTIVE products and ACTIVE AGENT members. Existing authenticated likeTargetProduct/likeTargetMember and all other role requirements remain unchanged.

## Visitor identity and reads

The browser generates a cryptographically random UUIDv4, keeps it in localStorage under quwat:guest-id and supplies `x-quwat-guest-id: <visitor UUIDv4>`. Do not supply an Authorization header to guest mutations. The UUID is unrelated to Mongo member IDs and never grants access to an account. The backend stores its SHA-256 hash, not the raw UUID.

Product and Member outputs now include `guestLiked: Boolean!`. Public queries with a valid visitor header restore the current browser's like state; missing/invalid identifiers and authenticated requests yield false. Only ACTIVE products/ACTIVE agents can return true. Authenticated callers continue using meLiked, with member-specific favorites unchanged. Guest field resolution loads the current guest's reference set once per GraphQL request, without exposing visitor identifiers or likes belonging to another guest.

## Set or remove a guest like

```graphql
mutation SetGuestLike($input: GuestLikeInput!) {
  setGuestLike(input: $input) {
    likeRefId
    likeGroup
    liked
    likeCount
  }
}
```

```json
{
  "input": {
    "likeRefId": "507f1f77bcf86cd799439011",
    "likeGroup": "PRODUCT",
    "liked": true
  }
}
```

Use MEMBER for an agent and liked:false to remove a like. The input accepts only target ID, PRODUCT/MEMBER group and desired boolean state; no memberId or arbitrary counter value is accepted. Unavailable products, inactive/non-agent members and malformed identifiers/inputs are rejected. Signed-in callers use the existing member APIs instead.

## Persistence, counters and boundaries

- guest_likes is independent of likes, with a unique guestKey/likeGroup/likeRefId index; existing indexes are not dropped or migrated. The new index is awaited before writes.
- The guest record and productLikes/memberLikes counter change in one transaction using the existing Mongo connection. MongoDB must support transactions. Retried desired-state writes do not toggle twice or inflate counts. Duplicate-key races retry; a failed counter update rolls back the record change, and unlikes cannot make a counter negative.
- Account and guest likes both contribute to the existing counts and ranking formulas. Guest likes do not appear in a member's favorites and are not automatically merged at login. Saved, cart, comments, attendance and sale permissions are unchanged.
- Refresh restores likes in the same browser while localStorage persists. Another browser/private session or cleared storage is a separate visitor. If storage is blocked, the key lasts for the current page lifetime. UUID identity does not prove a unique person or provide an anti-abuse system.
- No manual deployment database write, index sync/drop or live business mutation was used for validation. Unit/GraphQL/component checks use isolated doubles; replica-set concurrency integration remains separate.
