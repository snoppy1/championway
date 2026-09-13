# Mentor group conversations

The signed-in navigation opens `/chats`. Start a request from the mentor booking preview. `/chats/new?mentor=<id>` collects the team name and context, then opens `/chats/:id`.

## Permissions and lifecycle

- The request creator is the group owner and the only person who can invite, cancel invitations, or remove teammates. These checks run on the API, not just in the interface.
- A mentor must have a published submission linked to their user account. Unlinked sample profiles cannot receive requests.
- A new room is pending. The assigned mentor sees the request context in their inbox and must confirm there is no judging conflict before accepting. Acceptance grants membership. Declining makes the conversation read-only.
- Invitations appear in the recipient's inbox, expire after seven days, and require the same verified email. Google login currently supplies email verification. No invitation email is sent.
- Members can read the group's history, send messages and download attachments. Removing a member blocks subsequent API access. Owners cannot remove themselves or the assigned mentor through the teammate control.
- Owner and accepted mentor can set a future meeting time and an HTTPS Meet/Zoom link. Everyone in the group can open the link in a new tab. The meeting provider still controls admission.

## Delivery and storage

Messages refresh every three seconds while the page is visible; the inbox refreshes every five seconds. Cursor pagination loads older messages and catches up after reconnecting. A client UUID deduplicates retries. Read receipts indicate the most recent message viewed at the bottom of the visible conversation.

PNG, JPEG, WebP and PDF attachments are limited to 2 MB and validated by MIME and header. This first version stores base64 attachments privately in Postgres and serves them through a membership-checked download endpoint with `private, no-store`. Existing public Blob uploads are intentionally not used for chat. Before larger usage, move attachments to private object storage and introduce storage quotas; base64 adds storage overhead.

This is a conversation-request workflow, not a paid booking. There is no payment verification, automatic Meet/Zoom room creation, embedded video, email/push notification, or WebSocket transport. Meeting links are entered manually. Newly invited members can see earlier messages, which should be considered when inviting a teammate.

## Development

Migration `0001_brave_hiroim.sql` adds the four chat tables and their indexes. Apply it to the intended environment before deploying this code. Never point test resets at production.

```powershell
npm.cmd run db:migrate:test
npm.cmd test -- tests/chat.spec.ts
npm.cmd run build
```

For local development use `npm.cmd run dev:api` and `npm.cmd run dev` in separate terminals. The database migration command for the configured local development database is `npm.cmd run db:migrate`.

Tests use isolated accounts and a linked mentor in the test database. They cover role restrictions, verified invitations, expiry/revocation, removed-member access, private files, retry deduplication, pagination, meeting restrictions, creation/reload, responsive screenshots and axe checks.
