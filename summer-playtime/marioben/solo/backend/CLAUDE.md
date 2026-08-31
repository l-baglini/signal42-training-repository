# CLAUDE.md

Guidance for Claude Code (or any AI agent) picking up this repository. Read this before making
changes; read `SPEC.md` before adding or changing behavior; update `REVIEW.md` (or write a new
review section) after a review pass on non-trivial changes.

## What this is

Solo backend: a Spring Boot API for a single-user chat/journal mobile app with cloud backup and
cross-device sync (no multi-party messaging — every chat/message belongs to exactly one user). See
`SPEC.md` for the full functional specification; treat it as the source of intent, not this file.

## Stack

Java 21, Spring Boot 3.5.11, Maven. Spring Web + Spring Data JPA (Hibernate/MySQL dialect) + MySQL 8
via Liquibase migrations. Spring Security with JWT (OAuth2 Resource Server for verification,
`io.jsonwebtoken`/jjwt for minting). AWS SDK v2 for S3 (message/attachment content store). Lombok.
No frontend/mobile code lives in this repo. A second datasource, Postgres+pgvector, plus Spring AI's
MCP server, back the optional local AI message search (`com.solo.search`, see below).

## Build, run, test

```
./mvnw -q -o compile          # compile (offline; drop -o if deps aren't cached yet)
./mvnw -q clean package -DskipTests
./mvnw spring-boot:run         # runs on :8088, needs MySQL + JWT_SECRET (see below)
docker compose -f local/db/docker-compose.yml up -d   # local MySQL on :3306
```

No test suite currently exists in `src/test`. If you add tests, wire them into the normal
`./mvnw test` flow — don't invent a separate runner.

Local dev requires environment setup beyond defaults:
- `JWT_SECRET` — **required**, no default (see `application.yml`; must be ≥64 chars, enforced in
  `JwtService`). The app will not start without it.
- MySQL reachable at `DB_URL`/`DB_USERNAME`/`DB_PASSWORD` (defaults match
  `local/db/docker-compose.yml`).
- AWS S3 access: either real IAM credentials via `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` (put
  these in a gitignored `application-local.yml`, copy from `application-local.yml.example`, and run
  with `SPRING_PROFILES_ACTIVE=local`), or nothing — `S3Config` falls back to the AWS SDK's default
  credential chain (IAM role), which is fine for prod but won't work from a laptop with no
  role attached.
- `GOOGLE_CLIENT_IDS` — comma-separated Google OAuth client ids, only needed to exercise
  `/auth/google`; empty means that endpoint stays up but always rejects.

Sample `.http` requests for manual testing: `local/requests/*.http` (auth, chats, messages,
preferences). Note `preferences.http` is currently stale — it predates the plan-based preference
model (changelog `005`); don't trust its request body shape, trust `UpdatePreferenceRequestDto`.

### Local AI message search (optional — everything works without it)

`com.solo.search` (see SPEC.md §3.6) needs, entirely on your own machine, no cloud account:
- **Postgres+pgvector**: `docker compose -f local/db/docker-compose-vector.yml up -d` (port 5433,
  separate from the MySQL compose file — don't confuse it with any other local Postgres, e.g. a
  stray `postgres_solo` container on 5432 unrelated to this feature).
- **LM Studio** running locally with two models loaded: one for chat, one for embeddings.
- Env vars: `EMBEDDING_MODEL` (no default — must match the embedding model loaded in LM Studio),
  `LLM_MODEL` (defaults to `google/gemma-4-e4b`), `SEARCH_OWNER_EMAIL` (the one solo account this
  search feature will serve — see the single-account limitation in SPEC.md §3.6), and optionally
  `VECTOR_DB_URL`/`EMBEDDING_BASE_URL`/`LLM_BASE_URL` if not using the defaults.
- In LM Studio itself (outside this codebase, nothing here can automate it): configure an MCP
  integration named `mcp/solo` (or whatever `LLM_INTEGRATIONS` is set to) pointed at this backend's
  `http://localhost:8088/mcp/sse`.
- Leaving `EMBEDDING_MODEL`/`SEARCH_OWNER_EMAIL` unset is fine — `VectorSchemaInitializer` logs a
  message and the rest of the app runs completely normally; this feature never blocks startup.
- **Not yet verified against real LM Studio** (this codebase's dev sessions haven't had network
  access to it): the assumed request/response shapes for LM Studio's `/v1/embeddings` (OpenAI-
  compatible) and native `/api/v1/chat` (`{model, input, integrations}`) are documented
  assumptions, not confirmed contracts — see `REVIEW.md`'s local-AI-search section for exactly
  what was and wasn't verified live.

## Architecture / conventions

Package-by-feature under `com.solo.*`: `authentication`, `chat`, `message`, `plan`,
`userpreference`, `recovery`, `security`, `search`, plus cross-cutting `common` and `exception`. Each feature
module follows the same internal layout: `controller` → `service` → `repository`/`model`, with a
dedicated `*ValidationService` per module (not Bean Validation annotations — see below) and its own
`dto` package for request/response shapes.

- **Validation pattern**: despite `spring-boot-starter-validation` being a dependency, input
  validation is done imperatively via `com.solo.common.validation.Validations` static helpers
  (`requireNotBlank`, `requireEmail`, `requirePassword`, `requireOneOf`, ...), called from each
  module's `*ValidationService`, throwing `IllegalArgumentException` → mapped to 400. Follow this
  pattern for new endpoints rather than introducing `@Valid`/Bean Validation — mixing the two
  validation styles would make it unclear which one is authoritative for a given field.
  Do not add validation for scenarios the type system already prevents.
- **Error handling**: every domain exception is a plain unchecked `RuntimeException` with no extra
  fields, mapped to an HTTP status in the single `@RestControllerAdvice`
  (`com.solo.exception.ValidationExceptionHandler`), returning the uniform `ApiError` shape. Add new
  domain errors the same way: a small exception class + one `@ExceptionHandler` method, not ad-hoc
  `ResponseEntity` construction in controllers.
- **Ownership/tenant isolation**: every query touching chats/messages/preferences must be scoped to
  the authenticated user's id at the repository level (e.g. `findByIdAndUserDetailId`, not
  `findById` + a manual equality check). This was violated once (chat creation, see `REVIEW.md`
  finding #2) — when adding a new mutating endpoint, explicitly check: can this id belong to another
  user, and if so, is that scoped in the query itself?
- **Client-generated ids**: `Chat.id` and `Message.id` are client-supplied strings, not
  `@GeneratedValue`. Any entity with a client-supplied `@Id` needs an explicit existence check before
  `save()` in create paths — Spring Data JPA's default `isNew()` will otherwise `merge()` into an
  existing row instead of inserting. Don't add another such entity without repeating that check.
- **Message content storage**: MySQL holds thin index rows (`Message`); actual content
  (text/description/attachments) lives in S3 as gzip-compressed JSON (`MessageStorageService`,
  `MessageDocument`). Order of operations matters: **S3 write before DB insert**, so the DB never
  points at content that doesn't exist. Keep this order in any code that touches both.
- **Secrets**: `application.yml` is committed — anything in it must be safe to be public. Real
  secrets get no default (`${ENV_VAR}` with nothing after the colon) or default to blank and fall
  back to a proper credential source (AWS default credential chain). Local-only, non-sensitive
  values (like the dev MySQL root password, which matches `docker-compose.yml`) may keep a real
  default. See `REVIEW.md` finding #1 for the incident that motivated this rule — don't reintroduce
  a live-looking default for a real secret.

## Known accepted gaps (see SPEC.md §5 and REVIEW.md for detail — don't "fix" these silently)

- No refresh-token flow (config exists, unused). Don't wire it up without deciding rotation/
  revocation semantics first.
- No role/authority enforcement beyond "authenticated user" (the `Role`/`Authority` model exists
  but nothing checks it yet).
- `backup` table and `user_preference.fk_id_backup` column are dead schema from a removed feature —
  don't build on them; a future migration should drop them.
- Attachment content-type is trusted from the client, not verified against actual bytes.
- Local AI search (`com.solo.search`) serves exactly one configured account (`search.owner-email`),
  not every registered user — an intentional limitation, not a bug, see SPEC.md §3.6.
- `/mcp/**` is unauthenticated by design (LM Studio has no app JWT to present) — safe only because
  it's meant to run next to a local LM Studio on the same machine, never exposed to the internet.

## Working on this repo

- There is no test suite yet. If you fix a bug (like `REVIEW.md` findings #3–#11), consider adding
  the first test for that module rather than leaving verification purely manual.
- Before changing behavior, check `SPEC.md` — if the change contradicts it, update the spec section
  as part of the same change, don't let it drift.
- After a non-trivial change (new endpoint, security-relevant fix, schema change), do an explicit
  review pass and record it: either append a new dated section to `REVIEW.md` or open one if
  findings resulted, following the same format (severity, file/line, failure scenario, status).
- This repo currently has no `.git` — if/when it's initialized, double-check `.gitignore` still
  excludes `application-local.yml` and that `application.yml` has no live secret defaults before the
  first commit (see `REVIEW.md` finding #1).
