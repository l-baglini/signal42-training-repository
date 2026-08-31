# Solo Backend — Specification

**Status:** reverse-documented from the implemented system (2026-08-24). This spec was written
after the fact, from the actual behavior of the code, to serve as the reference intent document
for future changes — new features should update this file *before* implementation, and
implementation should be checked against it during review.

## 1. Purpose

Solo is the backend for a personal, single-user chat/journal mobile app with cloud backup and
cross-device sync. There is no multi-party messaging: a "chat" is a container the user creates for
their own conversation (e.g. with an AI assistant, or as a personal notebook), and every message in
it belongs only to that user. The backend's job is to:

- authenticate the user (email/password or Google Sign-In),
- store chat metadata and message content durably so it survives reinstall/device change,
- let the client sync locally-created messages (with optional photo/PDF attachments) to the cloud,
- let the client recover its full history for a given date range on a new device,
- track which subscription plan the user is on.

The mobile client is offline-first (local SQLite) and treats the backend as a sync target, not the
primary source of truth during normal use — hence client-generated ids for chats/messages, batched
sync calls, and idempotent writes.

## 2. Actors

- **End user** — owns exactly one account, one set of chats, messages, and one preference row.
  Every authenticated endpoint operates only on the calling user's own data.
- **Mobile client** (not in this repo) — generates chat/message ids locally, batches message syncs,
  requests recovery ranges, renders content fetched via presigned S3 URLs.

There are no admin, multi-tenant, or shared/collaborative concepts anywhere in the domain model.

## 3. Functional requirements

### 3.1 Authentication (`/register`, `/login`, `/auth/google`)

- A user registers with `name`, `email`, `password` (min 6 chars). Email must be syntactically
  valid and unique among non-deleted accounts. On success, the server returns an app-issued JWT
  access token.
- A user logs in with `email` + `password`. Unknown email, disabled account, or wrong password all
  return the *same* generic invalid-credentials error (no email enumeration on login).
- A user may sign in with Google instead, presenting a Google ID token. The server verifies the
  token's signature (Google JWKS), issuer, audience (against a configured allow-list of client
  ids), and requires `email_verified=true`. If an account with that email already exists, Google
  sign-in logs into it (account linking by verified email); otherwise a new account is created
  automatically with no usable password.
- Registration currently allows enumeration of already-registered emails (409 vs generic error) —
  see REVIEW.md finding on this; **acceptable for now**, not a required fix.
- Every authenticated request carries a Bearer JWT; the server resolves it to a user id and rejects
  the request (403) if that user can't be resolved or doesn't exist.
- There is no refresh-token flow. Access tokens are long-lived (7 days) by design, since the client
  force-logs-out on any 401 and there is nothing to silently refresh against.

### 3.2 Chats (`/chats`)

- A user can list, create, update (partial), and delete their own chats.
- A chat has: id (client-generated, stable across the chat's lifetime), name, icon, color,
  favorite flag, backup-opt-in flag, and a security mode (`none` / `pin` / `face`). In `pin` mode a
  PIN hash must be supplied and is stored; in any other mode no PIN hash is stored.
- Creating a chat whose id already exists **must be rejected** (409) — the id must never be
  reusable to hijack or overwrite another chat, regardless of which user made the original request.
- Reading, updating, or deleting a chat that does not belong to the caller must behave identically
  to that chat not existing (404), never revealing that it belongs to someone else.

### 3.3 Messages (`/chats/{chatId}/messages/...`)

- The client syncs messages in batches: a JSON list of messages plus zero or more binary attachment
  parts, one per declared attachment id.
- A message must belong to a chat owned by the caller. It needs either non-blank text or at least
  one attachment (never neither).
- Allowed attachment types: JPEG, PNG, WebP images and PDF. Every declared attachment must have a
  matching uploaded file part.
- Syncing a message id that has already been synced must be a no-op, not an error (supports client
  retry after a dropped connection) — the second attempt must never overwrite the first sync of
  that id, and must never silently drop content that a *different* user's client happened to
  produce under a colliding id.
- Message content (text + attachments) is stored as an object per message; only lightweight index
  metadata (chat, owner, timestamp, storage pointer) lives in the relational database. A message's
  free-text "description" can be updated after the fact independently of its original content.
- Message writes must not leave the database pointing at content that was never actually stored.
  Orphaned stored content (written but never indexed, e.g. after a mid-write failure) is an
  acceptable, self-healing side effect since a retry with the same id overwrites it — it must never
  be surfaced to the user as an error.
- `GET /chats/{chatId}/messages` returns every message in one chat (ordered oldest first), with
  content read back from storage the same way recovery does. This is the primary way a client
  without local persistence (the web app — see below) loads/reloads a chat's thread; a message
  whose stored content can't be read must be skipped from the result, not fail the whole call, for
  the same reason recovery skips unreadable messages (§3.4). There is currently no pagination or
  cap on this endpoint — acceptable for now, but a chat that accumulates a very large number of
  messages over time will eventually need one; not required until that's an actual problem.
- The mobile client (native) is offline-first: it keeps its own local database and treats the
  backend purely as a sync target, batching writes. The web client has no local persistence at
  all — every message it sends goes straight to `POST .../sync` as a single-message batch, awaited,
  and every chat's history is (re)loaded from `GET .../messages` on open. Both are valid clients of
  the same endpoints; the backend must not assume either write pattern (single vs. batched) or
  either read pattern (local-first vs. always-remote).

### 3.4 Recovery (`GET /chats/recover`)

- Given a `from`/`to` timestamp range, returns the user's full chat list plus every message created
  in that range, with attachment content reachable via short-lived download links.
- `from` must not be after `to`. A range that would return more than a fixed cap (2000 messages)
  must be rejected, asking the client to narrow it, rather than silently truncated or allowed to
  degrade performance unbounded.
- A message whose stored content can't be read (missing/corrupt) must be skipped, not cause the
  whole recovery call to fail — one bad message must never block recovering the rest of the user's
  history.

### 3.5 Plans & preferences (`/plans`, `/preferences`)

- `/plans` is a public, read-only catalog of subscription tiers (id, title, description, price),
  ordered by price.
- Each user has exactly one preference record, currently holding only their selected plan id. It is
  created on first access if it doesn't exist yet. Updating to an unknown plan id must be rejected.

### 3.6 Local AI message search (opt-in, `POST /search/chat`)

- Lets the user ask a natural-language question (e.g. "what's my phone password?") and get an
  answer found by searching across **all** of their messages, in every chat — not just the one
  currently open. Everything involved (embeddings, the final answer) runs on the user's own
  machine via a local **LM Studio** instance; no cloud AI API is used or required.
- Every synced message with non-blank text gets embedded and indexed (Postgres + pgvector,
  cosine similarity) as a best-effort side effect of sync — a missing/unreachable embedding
  model must never fail or block the message sync itself (§3.3's write path is unaffected).
- Retrieval is exposed as an MCP tool, not orchestrated by this backend directly: the LM Studio
  instance itself decides whether and when to call the tool while generating its answer.
  `POST /search/chat` only proxies the user's prompt to LM Studio (with the MCP integration
  attached) and passes back whatever LM Studio returns — this backend does not itself decide how
  to phrase or structure the final answer.
- **This feature is scoped to a single, pre-configured "owner" account** (`SEARCH_OWNER_EMAIL`),
  not to whichever user happens to be logged in. An MCP tool call from LM Studio carries no app
  session/JWT to scope itself by, unlike every other endpoint in this spec — so by design, one
  backend+LM-Studio pairing serves search for exactly one account. This is a deliberate, narrower
  guarantee than the tenant isolation required elsewhere in this document (§4): it does not leak
  another user's data, it simply isn't usable multi-tenant. `POST /search/chat` itself still
  requires a valid JWT — only a logged-in user can trigger a search-augmented chat at all.
- Not configuring `EMBEDDING_MODEL`/`SEARCH_OWNER_EMAIL` must leave the rest of the app fully
  functional; this feature is additive and optional, never a startup requirement.

## 4. Non-functional requirements

- **Tenant isolation**: every read/write of chats, messages, and preferences must be scoped to the
  authenticated caller at the query level — there must be no code path where one user's id/query
  can return or mutate another user's row.
- **Secrets**: no credential (JWT signing key, cloud storage keys) may have a real, usable value as
  a committed default. Config committed to the repository must be safe to make public; only
  non-secret defaults (region, issuer name, TTLs, bucket name) may be hardcoded.
- **Availability of partial data over strict consistency**: for recovery and sync, prefer returning
  what's available (skipping unreadable items) over failing the whole request.
- **File size**: multipart sync requests are capped (25MB per file / 50MB per request) to keep
  attachment handling bounded.

## 5. Explicitly out of scope (current version)

- Multi-participant conversations, sharing, or any concept of another user seeing your chats.
- A refresh-token flow (the config for it exists but is unused; do not wire it up without also
  deciding on rotation/revocation semantics).
- Server-side content moderation or virus scanning of uploaded attachments.
- Role/authority-gated endpoints (the `Role`/`Authority` model exists but nothing currently checks
  it beyond "is this a valid authenticated user").
- Actual verification of uploaded attachment bytes against their declared content type.
- Multi-tenant local AI search (§3.6) — one deployment's search feature serves one configured
  owner account, by design, not every registered user.

## 6. Data model summary

See `src/main/resources/db/changelog/*.sql` for the authoritative schema (changesets 001–007,
applied via Liquibase). Core tables: `user_detail`, `role`, `authority`, `authority_role`, `chat`,
`message`, `plan`, `user_preference`. Note: `backup` table and `user_preference.fk_id_backup`
column are dead (feature removed, migration to drop them never written) — do not build on them;
a future cleanup migration should drop them rather than resurrect the feature silently.

A second database, Postgres+pgvector, holds one table (`message_embedding`) for §3.6's local AI
search — created idempotently at startup (not via Liquibase, see `VectorSchemaInitializer`), kept
deliberately separate from the MySQL schema above since it's a denormalized, rebuildable index
(same "index, not source of truth" relationship the `message` table already has with S3).

## 7. How to extend this spec

When adding a feature: add a subsection under §3 describing the new behavior in the same
requirement style (what must happen, what must be rejected, what must be isolated per-user) *before*
writing the implementation. Update §5 if it changes what's out of scope. This keeps the spec usable
as the acceptance checklist for the review pass described in `REVIEW.md`.
