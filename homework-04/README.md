# onetag-sellers-data (homework-04)

TypeScript refactor of the OneTag *sellers.json* tool

- **Server** (`src/server`): an Express + EJS app that lets you browse imported
  sellers and inspect a domain's `ads.txt` against the collected data.
- **Importer** (`src/import`): fetches every SSP's `sellers.json` and stores
  newly seen sellers in MongoDB. Runs once (`--now`) or on a daily schedule.

## Project layout

```
src/
  config.ts            env loading + validation (fails fast on missing vars)
  db.ts                MongoDB connection helpers
  types.ts             shared domain types
  ssp-list.ts          the list of SSPs to ingest
  server/
    index.ts           server entrypoint (HTTP + graceful shutdown)
    app.ts             Express app factory
    routes/index.ts    /sellers and /ads-txt routes
    adstxt.ts          ads.txt fetch + annotation
    validate.ts        AJV request-body middleware
  import/
    index.ts           importer entrypoint (--now or scheduled)
views/                 EJS templates
public/                static assets (client JS/CSS, logo)
deploy/                example ECS task definition
Dockerfile
```

## Local development

```bash
npm install
cp .env.example .env      # adjust DATABASE_URL if needed
npm run dev:server        # http://localhost:8802
npm run dev:import        # run a one-off import
```

Requires Node.js 20+ and a reachable MongoDB.

## Build & run

```bash
npm run build             # tsc -> dist/
npm run start:server      # node dist/server/index.js
npm run import            # node dist/import/index.js --now
```

## Docker

```bash
docker build -t onetag-sellers-data .

# Web server
docker run --rm -p 8802:8802 --env-file .env onetag-sellers-data

# One-off import (overrides the default command)
docker run --rm --env-file .env onetag-sellers-data \
  node dist/import/index.js --now
```

## Local testing with Docker Compose

`docker-compose.yml` brings up MongoDB and the web server together, wiring the
server at `DATABASE_URL=mongodb://mongo:27017/` — no `.env` required.

```bash
docker compose up --build            # mongo + server -> http://localhost:8802
docker compose run --rm importer     # one-off sellers.json import into mongo
docker compose down -v               # stop and wipe the mongo volume
```
