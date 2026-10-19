# Rolling authentication sessions

Implemented 2026-10-17. Existing Nest JWT/AuthGuard/Apollo architecture and localStorage accessToken storage remain.

## Contract

```graphql
mutation RefreshSession {
  refreshSession { _id memberType memberStatus memberNick accessToken }
}
```

Requires Authorization: Bearer <current valid JWT>. No arguments are accepted. AuthGuard verifies the signature and expiry, then looks up the current ACTIVE member. AuthService returns current profile data without a password, plus a JWT carrying only _id, iat and exp. The existing JwtModule 30d setting makes exp the issuance timestamp plus 2592000 seconds. All current roles (CLIENT/AGENT/ADMIN) may renew their own active session. Expired, malformed/tampered, missing-account and BLOCK/DELETE credentials are denied. Nothing is written to member, social, sale or attendance storage.

## Frontend behavior

- App entry, window focus and a tab becoming visible call restoreSession with renewal enabled. Explicit retry/session checks do the same. Ordinary route navigation within the already open app does not mint a token by itself.
- Cross-tab accessToken storage changes validate with checkAuth/getMember without minting another token. This avoids ping-pong renewal. Removing/clearing browser storage expires the session; same-account rotation preserves cached queries and cart state.
- Concurrent events for one token share a request. A visit arriving during non-renewing validation queues renewal. An account switch may begin its own request and clears the old cache; responses for a superseded token cannot replace the current account or undo logout.
- Expired/malformed local tokens are removed before any renewal request. Auth denial clears the session. Network failure retains the old token and offers the existing retry flow.
- No periodic hidden/background renewal runs. With no successful return/renewal for 30 days, the user must log in again. A renewed token is stored only after matching the current identity, ACTIVE status and a future expiry.

## Existing boundaries

This is renewal of a valid access token, without a separate refresh token or persisted session table. A prior JWT remains valid until its own expiry if the account is still ACTIVE; renewal/local logout do not revoke previously issued tokens. Active recurring visits can continue the session without an absolute maximum duration. Existing profile saves and logins also issue a new 30-day JWT. Browser data and account database records remain separate: session expiry/logout do not delete the account, saved products, sales or attendance history.

## Validation

10 new tests exercise the real Nest GraphQL resolver/AuthGuard/JwtService with isolated member-model doubles; 9 frontend tests exercise renewal, browser event lifecycle, concurrency, retries, logout and account switching. No deployment database or live user token is required.
