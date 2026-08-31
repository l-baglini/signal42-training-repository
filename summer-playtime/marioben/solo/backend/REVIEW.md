# Solo Backend — Review Pass

**Date:** 2026-08-24
**Reviewer:** Mario Benissimo (m.benissimo@onetag.com), with AI-assisted analysis reviewed and
verified by hand before acting on it — findings below were re-checked against the actual source
before being marked CONFIRMED; nothing here was accepted on the analysis's word alone.
**Scope:** full codebase (`src/main/java/com/solo/**`), all Spring config
(`application.yml`, `application-local.yml.example`), Liquibase changelogs 001–007,
`local/db/docker-compose.yml`. No git history exists yet, so this is a point-in-time review of the
current tree against `SPEC.md`, not a diff review.
**Method:** independent architecture-inventory pass + independent security/correctness pass,
cross-checked against each other and against the source for every finding reported here. Two
findings below were spot-verified by hand (reading the exact files/lines cited) before being acted
on; the rest were accepted after their file/line citations were checked to actually say what was
claimed.

## Summary

| # | Finding | Severity | Status |
|---|---|---|---|
| 1 | Real-looking secrets hardcoded as config defaults | Critical | **Fixed** |
| 2 | Chat creation can hijack/overwrite another user's chat | High | **Fixed** |
| 3 | Malformed JSON body returns 500 instead of 400 | Medium | Open |
| 4 | Unclosed input stream on attachment upload | Medium | Open |
| 5 | S3 network I/O held inside a DB transaction | Medium | Open |
| 6 | Message idempotency check is not tenant-scoped | Low/Medium | Open |
| 7 | JWT signing key exposed via generated getter | Low | Open |
| 8 | Dead refresh-token config | Low | Open (accepted) |
| 9 | Attachment content-type trusted, not verified | Low | Open (accepted risk) |
| 10 | Email enumeration on registration | Low | Open (accepted risk) |
| 11 | Race condition in preference auto-creation | Low | Open |

## 1. CRITICAL — Real-looking secrets committed as config defaults — **FIXED**

**File:** `src/main/resources/application.yml`

- `spring.security.jwt.secret` had a hardcoded 88-char default that passes `JwtService`'s
  `length() >= 64` check — a fully functional signing key, not a placeholder.
- `aws.access-key-id` / `aws.secret-access-key` had a real-format AWS key/secret pair as defaults.
- This directly contradicted the file's own comment ("access-key-id/secret-access-key default to
  blank here on purpose") and the design already established by `application-local.yml.example`
  (real AWS keys belong only in the gitignored local-profile file).

**Impact if left in place:** anyone with read access to the repo — or any deployment that forgot to
set the env vars — could mint valid JWTs for any user id (`JwtTokenConverter` trusts any subject
that parses as a user id → full account takeover) and/or use the leaked AWS keys directly against
the S3 bucket, bypassing the app entirely.

**Fix applied:** `JWT_SECRET` now has no default (`${JWT_SECRET}`) — the app fails to start rather
than silently signing with a value anyone can read. `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`
default to blank, matching the file's own documented intent and existing `S3Config` fallback to the
AWS SDK's default credential chain.

**Not changed:** `spring.datasource.password` default (`Mario1!`) — kept intentionally. It is a
local-only MySQL root password that already matches `local/db/docker-compose.yml` verbatim, which
would be committed either way; removing it here without also changing the compose file breaks
`./mvnw spring-boot:run` out of the box for no security benefit, since that MySQL instance only
binds to localhost in the provided compose file.

**Action still required (outside this repo):** if the removed AWS/JWT values were ever live
credentials, **rotate them** — a since-removed value in file history is not the same as revoked.

## 2. HIGH — Chat creation could hijack another user's chat — **FIXED**

**Files:** `src/main/java/com/solo/chat/service/ChatService.java`,
`src/main/java/com/solo/chat/model/Chat.java`

`Chat.id` is a client-supplied `String @Id` with no `@GeneratedValue`, `@Version`, or `Persistable`
override. Verified by reading both files: because the id is always non-null by the time
`chatRepository.save()` runs, Spring Data JPA's default `isNew()` check returns `false`, so `save()`
performs `entityManager.merge()` instead of `persist()`. `create()` had no existence/ownership check
before calling `save()` — unlike `update()`/`delete()`, which correctly scope by `(id, userId)`.

**Failure scenario (confirmed, not theoretical):** `POST /chats` with an `id` equal to an existing
chat belonging to a *different* user would silently overwrite that chat's name/icon/color/security
fields and reassign `fk_id_user_detail` to the caller. Since the app mirrors chat ids into local
SQLite on an offline-first client, this is realistically triggerable by an account switch on a
shared device without clearing local storage, or by any client bug that replays an id — not only by
a deliberate attacker guessing another user's UUID.

**Fix applied:** `ChatService.create()` now checks `chatRepository.existsById(dto.id())` first and
throws a new `ChatIdConflictException` (mapped to `409 Conflict` in `ValidationExceptionHandler`)
instead of proceeding to `save()`. Verified the project still compiles (`./mvnw -o compile`).

**Residual, accepted risk:** the existence check and the subsequent insert are not atomic, so two
concurrent `POST /chats` requests with the same brand-new id could both pass the check before either
inserts; the DB's primary-key constraint would then reject the second and it would surface as a
generic 500 (same class of issue as finding #11). Not fixed here — it's a pre-existing pattern
elsewhere in the codebase (see #11) and out of scope for this pass; worth a follow-up if create
traffic with colliding fresh ids turns out to be non-negligible.

## 3. MEDIUM — Malformed request bodies return 500 instead of 400 — Open

**File:** `src/main/java/com/solo/exception/ValidationExceptionHandler.java`

No handler for Spring's `HttpMessageNotReadableException`; it falls through to the catch-all
`Exception`/`RuntimeException` handler, which returns 500 and logs at ERROR. An unparseable JSON
body to any `@RequestBody` endpoint (e.g. truncated JSON to `/login`) is a client error but is
reported and logged as a server error, polluting logs and confusing clients that branch on 4xx vs
5xx.

**Recommendation:** add a dedicated `@ExceptionHandler(HttpMessageNotReadableException.class)` →
400, above the catch-all.

## 4. MEDIUM — Unclosed input stream on attachment upload — Open

**File:** `src/main/java/com/solo/message/service/MessageStorageService.java` (`uploadAttachment`)

`file.getInputStream()` is passed to `RequestBody.fromInputStream(...)` without try-with-resources;
the AWS SDK does not close the stream it's handed. Under sustained upload traffic this leaks a file
descriptor per attachment (worse for larger uploads, which Spring backs with a temp file) until GC
finalization reclaims it.

**Recommendation:** wrap the upload in try-with-resources so the stream is closed once the PUT
completes.

## 5. MEDIUM — S3 network I/O performed inside a DB transaction — Open

**File:** `src/main/java/com/solo/message/service/MessageQueueService.java` (`writeToStorage`)

The method is `@Transactional` and performs the S3 PUT (up to 25MB) *before* the DB insert, while a
pooled JDBC connection is checked out for the whole call. Under concurrent syncs with slow/large
uploads this can starve the connection pool and cause unrelated requests to time out.

**Recommendation:** perform the S3 write outside the transactional boundary (it already has to
happen before the DB insert for correctness — that ordering is right, see SPEC.md §3.3 — it just
shouldn't hold a DB connection open while doing it).

## 6. LOW/MEDIUM — Message idempotency check is not tenant-scoped — Open

**File:** `src/main/java/com/solo/message/service/MessageQueueService.java`

`existsById(message.id())` checks a globally unique PK, not `(userId, chatId, id)`. If two different
users' clients ever produced the same message id, the second sync would silently no-op and that
user's content would never be stored — a silent data-loss path rather than a visible error. Lower
risk than a security issue since it requires an id collision across users (client-generated ids are
expected to be sufficiently unique), but the failure mode is unusually bad (silent loss, not an
error) if it ever happens.

**Recommendation:** scope the existence check to `(fk_id_user_detail, id_message)` at minimum, so a
cross-user collision fails loudly (409) instead of silently dropping content.

## 7. LOW — JWT signing key exposed via generated getter — Open

**File:** `src/main/java/com/solo/security/service/JwtService.java`

Class-level `@Getter` on the singleton service generates `getKey()`, returning the raw `SecretKey`
used to sign every token, to any code holding a `JwtService` reference. Not currently exploited
anywhere, but unnecessary surface for the single most sensitive value in the app.

**Recommendation:** move `@Getter` off the class and keep the key field genuinely private, or
annotate only the fields that need external read access.

## 8. LOW — Dead refresh-token config — Open (accepted)

`refresh-ttl-seconds` is read into `JwtService` but never used by any endpoint — matches the
config file's own comment. Harmless. Per SPEC.md §5, don't wire up a refresh flow opportunistically;
either remove the dead config or implement the flow deliberately (with rotation/revocation
considered), not both half-done.

## 9. LOW — Attachment content-type is trusted, not verified — Open (accepted risk)

**File:** `src/main/java/com/solo/message/validation/MessageValidationService.java`

Only the client-declared `contentType` is checked against an allow-list; file bytes are never
inspected. Accepted for now since attachments are only ever fetched via short-lived presigned URLs
by their owner — revisit if attachment URLs are ever opened in a shared/browser context where a
mislabeled file could matter.

## 10. LOW — Email enumeration on registration — Open (accepted risk)

`POST /register` returns a distinct 409 with an explicit message for an already-registered email,
while `/login` correctly uses one generic error for both "unknown email" and "wrong password". This
is a real minor enumeration vector but a common, low-severity, and often accepted trade-off for
clear registration UX — noted in SPEC.md §3.1 as accepted rather than required to fix.

## 11. LOW — Race condition in preference auto-creation — Open

**File:** `src/main/java/com/solo/userpreference/service/UserPreferenceService.java` (`getOrCreate`)

Check-then-act without locking; two concurrent first calls for the same user can both miss the find
and both attempt insert. The DB's unique constraint on `fk_id_user_detail` correctly prevents a
duplicate row, but the rejected insert currently surfaces as an unhandled
`DataIntegrityViolationException` → generic 500 instead of being retried or handled as "someone else
already created it, just fetch it."

**Recommendation:** catch `DataIntegrityViolationException` around the insert and re-fetch on
conflict.

## Verified as correct (explicitly checked, no finding)

- Google ID token verification: signature (Google JWKS), issuer, audience, and expiry are all
  checked; fails closed when no client id is configured.
- App JWT decoding: HMAC-SHA512 signature and issuer checked; expiry enforced by Spring's default
  validators.
- Password hashing: BCrypt, correctly applied.
- Chat/message/preference **update and delete** paths (as opposed to the create bug in #2) all
  correctly scope lookups by `(id, userId)` — IDOR-safe.
- Liquibase changelogs 001–007 are logically ordered with appropriate indexes for the query
  patterns actually used; no destructive/irreversible drops beyond already-dead columns.
- Recovery's parallel S3 fan-out does not rely on lazy-loading outside a Hibernate session — safe.

## Follow-ups not addressed in this pass

Findings #3–#11 are documented but intentionally left open — this pass fixed the two
findings that were either a live secrets leak or an active cross-tenant data-integrity bug
(SPEC.md §4's tenant-isolation and secrets requirements). The rest are real but lower severity or
already-accepted trade-offs; re-run this review after addressing any of them, or before the next
significant feature, to keep SPEC.md and the codebase in sync.

---

## 2026-08-24 — Review of `GET /chats/{chatId}/messages` (added for the web frontend)

**Scope:** `MessageController.list`, `MessageQueueService.list`/`loadOrSkip`,
`MessageRepository.findByChatIdAndUserDetailIdOrderByCreatedAtAsc`, and the new
`RemoteMessageDto`/`RemoteAttachmentDto`/`ListMessagesResponseDto` records — added so the (now
SQLite-less) web client can load/reload a chat's message thread. See `SPEC.md` §3.3.

**Checked:**
- **Tenant isolation**: `chatRepository.existsByIdAndUserDetailId(chatId, userId)` is checked
  before anything else, so a chat that doesn't exist or isn't the caller's own returns 404
  (`ChatNotFoundException`), matching every other chat-scoped endpoint. The repository query
  itself is additionally scoped by `(chatId, userDetailId)`, so even if the existence check were
  ever removed by mistake, the query alone would never leak another user's messages.
  **CONFIRMED safe** — no finding.
- **Partial-failure tolerance**: mirrors `RecoveryService.loadOrSkip` — an unreadable S3 object
  logs a warning and is dropped from the result rather than failing the whole request. Consistent
  with the existing recovery behavior and with SPEC.md §3.4's equivalent requirement.
- **No pagination/cap**: unlike `RecoveryService` (`MAX_MESSAGES = 2000`, bounding a
  cross-chat date range), this endpoint has no upper bound — a single chat's full history is
  always returned. Documented as an accepted, known limitation in SPEC.md §3.3 rather than a
  defect: normal usage (a personal chat) won't approach a size where the parallel-fetch fan-out
  becomes a real cost, and adding pagination now would be speculative. **Revisit if evidence of an
  actual slow/huge chat shows up** — don't build it preemptively.
- **Code duplication**: `loadOrSkip`/the parallel-executor pattern duplicates
  `RecoveryService.loadOrSkip` (~20 lines). Deliberate — extracting a shared abstraction for two
  call sites with the codebase's existing bias against premature abstraction wasn't judged worth
  it; revisit only if a third caller appears.

**Verification:** `./mvnw -o compile` succeeds.

---

## 2026-08-24 — Review of local AI message search (`com.solo.search`, Postgres+pgvector, LM Studio)

**Scope:** the new `com.solo.search` package (`VectorDbConfig`, `VectorSchemaInitializer`,
`EmbeddingClient`, `VectorSearchRepository`, `MessageSearchService`, `MessageSearchTools`,
`McpConfig`, `LlmChatClient`, `SearchController`), the embedding hook added to
`MessageQueueService.writeToStorage`, the `/mcp/**` entry in `SecurityConfig`, and the new
`vector`/`embedding`/`llm`/`search`/`spring.ai.mcp.server` config in `application.yml`. Ported from
an existing sibling project (`quoak`) at the user's explicit request; see `SPEC.md` §3.6.

**Checked:**
- **Dual-datasource wiring (`VectorDbConfig`)**: re-declaring the MySQL datasource as `@Primary`
  and adding the Postgres one as a second, unqualified bean is the standard Spring Boot pattern
  for two datasources. **Verified live**, not just by inspection: started the app against a real
  temporary MySQL *and* a real temporary Postgres/pgvector container together — Liquibase, JPA,
  and every pre-existing endpoint (register/login/create chat, including the ownership-conflict
  check from the earlier review pass) behaved exactly as before. No regression on the existing
  MySQL-backed functionality from adding the second datasource. **CONFIRMED safe.**
- **pgvector schema correctness**: `VectorSchemaInitializer` auto-detects the embedding dimension
  from a real probe call rather than a guessed config number, and `VectorSearchRepository`'s
  cosine-distance query was verified directly against a live pgvector instance (three rows across
  two users; the query for user 1 correctly returned only that user's two rows, ordered by
  ascending distance, with the identical-vector row at distance 0) — confirms both the SQL syntax
  and the tenant-scoping `WHERE fk_id_user_detail = ?` clause work as intended.
- **`/search/chat` proxy (`SearchController`/`LlmChatClient`)**: verified live end-to-end against a
  mock LM Studio server — a valid JWT is required (401 without one, matching every other
  non-public endpoint), and the prompt (including non-ASCII text) round-trips correctly to the
  configured local LLM endpoint with the `model`/`integrations` fields intact.
- **Best-effort embedding on sync**: `MessageQueueService.writeToStorage`'s new embedding step is
  wrapped in its own try/catch and cannot fail the message sync itself — confirmed by inspection
  and by the fact `VectorSchemaInitializer` itself degrades to a log warning (not a startup
  failure) when the embedding model/Postgres aren't reachable, tested live (empty
  `EMBEDDING_MODEL` → clean startup, feature simply inactive).
- **Not verified live (accepted gap, environment limitation, not a code defect)**: the
  S3-dependent parts of the pipeline — actually embedding a real synced message and reading its
  content back from S3 during a search — could not be exercised in this session (no AWS
  credentials/network access to S3 in this environment, a pre-existing limitation noted in the
  earlier frontend-verification session too). The read/write calls into `MessageStorageService`
  reuse the exact same, already-reviewed methods `RecoveryService`/`MessageQueueService.list` use,
  so the risk here is specifically the *new* glue code (`MessageSearchService`'s loop, the
  embedding call placement), not the S3 access pattern itself. **Recommend a real end-to-end
  pass** (real message with a fake "password" in text, real LM Studio, real MCP integration
  configured) before relying on this feature.
- **Deliberate design deviation from quoak, called out on purpose**: quoak's equivalent MCP tool
  (`KbSemanticSearchTools`) accepts a `restaurantName` parameter it never actually uses to filter
  — an unscoped/incomplete pattern. This port fixes that: `MessageSearchTools` takes no identity
  parameter from the LLM at all; scoping is resolved server-side from `search.owner-email`,
  documented in SPEC.md §3.6 as a single-account limitation rather than left ambiguous.
- **Accepted risk, documented**: `/mcp/**` is unauthenticated (`SecurityConfig`) because LM Studio
  has no application JWT to present. Safe only because both processes are expected to run on the
  same machine, never exposed to the internet — flagged explicitly in both `SecurityConfig`'s
  comment and SPEC.md §3.6; would need real protection before any public deployment.

**Verification:** `./mvnw -o compile` succeeds; live-tested against real temporary MySQL +
Postgres/pgvector containers and a mock LM Studio server (see above); `docker-compose-vector.yml`
and all temporary test containers were torn down after verification.
