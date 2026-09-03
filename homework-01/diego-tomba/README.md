# RepoWatcher 🔭

Monitor per repository Git con storytelling AI-powered e stima dei costi degli agenti Claude.
Disponibile come **CLI** e come **applicazione web** (Next.js).

## Funzionalità

- **🖥️ Interfaccia web** — App Next.js con schede per Setup (token), Repository, Storico (consumi + report), Prompt del narratore e Consumi dettagliati
- **📊 Stima costi agente** — Traccia consumi di token e costi del Claude Agent SDK, con media e percentile 90 per suggerire budget ottimali
- **🧭 Indicatore consumo** — Indicatore minimale in header (spesa del mese vs budget), cliccabile per il dettaglio
- **🔍 Monitoraggio multi-repo** — Recupera PR, Issue ed eventi dei Project Board da GitHub (con supporto futuro per GitLab), per più repository
- **📖 Storytelling AI guidato** — Genera report narrativi in Markdown col Claude Agent SDK, guidabili con prompt personalizzati
- **⏰ On-demand e schedulato** — Esecuzione manuale dall'UI o via worker demone (cron per repo)
- **💾 Persistenza con Prisma** — SQLite locale di default, sostituibile (Postgres/MySQL) cambiando il `datasource`

## Architettura

Il progetto segue la **Clean Architecture** con layer concentrici. Le dipendenze
puntano **sempre verso l'interno**: il dominio non conosce l'infrastruttura, e
cambiare database o piattaforma Git significa solo scrivere un nuovo adapter.

```
┌──────────────────────────────────────────────────────────┐
│  Presentation  (CLI + Web Next.js: API routes, UI)        │
├──────────────────────────────────────────────────────────┤
│  Application   (Use Cases + Ports)                        │
├──────────────────────────────────────────────────────────┤
│  Domain        (Entities + Repository interfaces)         │
├──────────────────────────────────────────────────────────┤
│  Infrastructure (Prisma, Octokit, Claude Agent SDK)       │
└──────────────────────────────────────────────────────────┘
```

L'app web (Next.js) e la CLI sono due _presentation layer_ che riusano gli
**stessi use case**.

## Prerequisiti

- **Node.js >= 20.9**
- **GitHub Personal Access Token** con scope `public_repo` + `read:project`
- **Anthropic API key** (per lo storytelling AI)

## Setup

```bash
# 1. Installa le dipendenze
npm install

# 2. Inizializza il database (SQLite via Prisma)
npx prisma migrate deploy   # oppure: npm run db:migrate (in sviluppo)
```

`DATABASE_URL` è definita in `.env` (default `file:./dev.db`). Per cambiare
backend, modifica `provider`/`url` in `prisma/schema.prisma`.

## Applicazione Web

```bash
npm run dev      # sviluppo (http://localhost:3000)
# oppure
npm run build && npm run start
```

All'avvio apri l'app e vai nella scheda **Setup** per inserire i token (GitHub e
Anthropic) e il budget mensile — sono salvati nel database locale. Poi:

- **Repository** — aggiungi i repo da monitorare; "Genera report ora" li esegue
  on-demand; un'espressione cron (opzionale) li abilita allo scheduling.
- **Storico** — grafico dei consumi nel tempo e lista dei report (apri il
  Markdown).
- **Prompt** — definisci e attiva il prompt che guida il narratore AI.
- **Consumi** — dettaglio spesa/budget, spesa per task type e stime p90.

### Worker schedulato (demone)

Per eseguire automaticamente i repo con cron, avvia il worker (processo separato
e robusto):

```bash
npm run worker
```

Tienilo attivo in background con il tuo process manager preferito
(`nohup`, `pm2`, `systemd`). È un processo separato dal server web, così lo
scheduling resta robusto e indipendente.

> **Nota sull'indicatore di consumo:** Anthropic non espone un saldo/credito
> residuo interrogabile via SDK. L'indicatore confronta la spesa reale tracciata
> localmente (il `total_cost_usd` riportato dall'SDK per ogni run) con il budget
> impostato in Setup.

## Uso CLI

```bash
# Token via ambiente
export GITHUB_TOKEN=ghp_xxx
export ANTHROPIC_API_KEY=sk-ant-xxx

# Monitora un repository (default: prebid/Prebid.js)
npm run watch
REPO_OWNER=facebook REPO_NAME=react npm run watch

# Esegui un task agente con tracking dei costi
npm run agent -- "analyze-pr"
```

## Variabili d'Ambiente

| Variabile           | Default              | Descrizione                                   |
|---------------------|----------------------|-----------------------------------------------|
| `DATABASE_URL`      | `file:./dev.db`      | Datasource Prisma (in `.env`)                 |
| `GITHUB_TOKEN`      | —                    | PAT GitHub (CLI; nell'app web via Setup)      |
| `ANTHROPIC_API_KEY` | —                    | API key Anthropic (CLI; nell'app web via Setup)|
| `REPO_OWNER`        | `prebid`             | Owner del repository (CLI)                     |
| `REPO_NAME`         | `Prebid.js`          | Nome del repository (CLI)                      |
| `GIT_PLATFORM`      | `github`             | Piattaforma Git (`github` \| `gitlab`)         |

## Struttura Progetto

```
prisma/                      # Schema Prisma + migrazioni
app/                         # Next.js App Router (UI + API routes)
  api/                       #   route handlers REST
components/                  # UI React (tabs, charts, primitive, indicatore)
lib/                         # store Zustand, client API, server-container
worker/                      # Scheduler demone (node-cron)
src/                         # Core Clean Architecture (condiviso CLI + web)
├── domain/                  #   entità, interfacce repository, servizi puri
├── application/use-cases/   #   RunRepoWatch, GenerateStorytelling, GetEstimate, …
├── infrastructure/
│   ├── persistence/prisma/  #   repository Prisma (implementano le interfacce)
│   ├── github/              #   OctokitGitPlatformAdapter
│   └── ai/                  #   ClaudeNarratorAdapter
├── presentation/cli/        #   entry point CLI
└── config/                  #   EnvConfig, DI Container
```

## Estendibilità

- **Nuovo database**: cambia il `datasource` Prisma (le interfacce di dominio non cambiano)
- **Nuova piattaforma Git**: implementa `GitPlatformPort` (es. `GitLabAdapter`)
- **Nuovo narratore AI**: implementa `AiNarratorPort`

## License

ISC
