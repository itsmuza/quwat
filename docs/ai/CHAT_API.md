# Public chat WebSocket protocol

Updated: 2026-10-16. The existing shared public room uses raw WebSocket on the API port (development ws://localhost:3007), not GraphQL subscriptions or Socket.IO. The frontend uses REACT_APP_API_WS and keeps the socket connected while the panel is closed for existing agent sale notification hints.

## Access and identity

Guests may connect without a token. Authenticated connections use the existing token query parameter. The server revalidates a supplied token before each content message, including current ACTIVE status. Failed validation returns CHAT_AUTH_REQUIRED and does not publish the message. Public events include only member _id, memberNick and optional memberImage; no phone, address, password or token is broadcast. Anonymous senderId identifies a connection, changes on reconnect and is not an account identity.

## Client request

```json
{"event":"message","data":"Salom!"}
```

Data must be a string with at least one non-whitespace character and at most 1000 characters before trimming. Stored/broadcast text is trimmed. Invalid input returns CHAT_INVALID_MESSAGE without appending history or broadcasting content.

## Server events

| Event | Fields and meaning |
| --- | --- |
| connected | clientId: random connection UUID; sent to the new client |
| info | totalClients, public memberData or null, action joined/left; connection count, not unique people |
| getMessages | list: ordered last 50 message objects; sent on connection |
| message | id, senderId, createdAt ISO timestamp, text, public memberData or null |
| chatError | code: CHAT_INVALID_MESSAGE or CHAT_AUTH_REQUIRED |
| saleChanged | Existing data-free hint for currently authorized ACTIVE AGENT connections; content and role checks are unchanged |

Messages are shared with all connected room participants, including guests. The frontend renders text as escaped React content, filters malformed messages, bounds history to 50 and deduplicates message IDs. It reconnects with bounded backoff and manual retry. A successful browser send is not a durable-delivery acknowledgement; the server echo displays the message.

## History and validation limits

The last 50 messages are held only in the API process memory. Restarting the process clears history; multiple independent API processes do not share chat history. No database collection, private/direct messaging, attachments or durable chat persistence was added.

Validation uses isolated gateway tests, a DB-free real Nest/raw-WebSocket transport test, frontend component tests and two browser clients against a separate localhost test gateway. The running application was only connected to read history/events; no live content messages were sent for verification.
