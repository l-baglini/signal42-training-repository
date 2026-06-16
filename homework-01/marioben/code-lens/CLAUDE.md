# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Backend (Spring Boot, Java 21)
```bash
cd backend
./mvnw spring-boot:run          # start the API on :8080
./mvnw test                     # run all tests
./mvnw test -Dtest=ClassName    # run a single test class
./mvnw package -DskipTests      # build JAR
```

Requires `MISTRAL_API_KEY` set in the environment, or edit `backend/src/main/resources/application.properties` directly.

### Frontend (React 19 + Vite)
```bash
cd frontend
npm install      # first time only
npm run dev      # dev server on :5173
npm run build    # production build
npm run lint     # ESLint
```

## Architecture

The app is a two-snippet AI code reviewer. The user pastes two code snippets; the backend forwards them to the Mistral API and returns structured scores + a winner verdict. The frontend visualises the result.

```
topic-tracker/
├── backend/   # Spring Boot 4.1 REST API
└── frontend/  # React 19 SPA
```

### Backend request flow

`POST /api/review` → `CodeReviewController` → `MistralService` → Mistral API

`MistralService` builds a chat request with a hardcoded system prompt that enforces strict JSON output (`response_format: json_object`, temperature 0.2). The raw JSON string returned by Mistral is parsed directly into `CodeReviewResponse` via `ObjectMapper`.

DTOs (`CodeReviewRequest`, `CodeReviewResponse`, `SnippetReview`, `CriterionResult`) map 1-to-1 to the JSON contract. If you change the system prompt's JSON schema you must update the DTOs to match.

CORS is configured in `WebConfig` to allow `localhost:5173` and `localhost:3000`. Add origins there if needed.

Validation errors (empty snippets) return `400` via `GlobalExceptionHandler`; all other exceptions return `500` with `{"error": "..."}`.

### Frontend data flow

`App.jsx` owns all state and makes the single `POST /api/review` fetch. Results are passed as props to:
- `ReviewResults` — winner banner + renders two `SnippetCard` instances side by side
- `SnippetCard` — per-snippet scores, uses `ScoreBar` for each criterion
- `GuideSection` — collapsible info panel (purpose, how-to, ECC repo link); no state dependencies

All CSS lives in `App.css` (CSS custom properties defined in `index.css`). There is no CSS-in-JS or CSS modules.

## Key configuration

`backend/src/main/resources/application.properties`:
- `mistral.model` — swap model here (`mistral-small-latest`, `mistral-medium-latest`, `open-mistral-7b`)
- `mistral.api.key` — reads from `$MISTRAL_API_KEY` env var with a fallback default already set
