# NewsDesk

Una redazione personale che comprime informazione. Tre cose in un'app:

1. **Notizie** del giorno con filtro per argomento e raggruppamento automatico per topic (es. "Iran"), con riassunto e fonti citate.
2. **Paper watch** — segui argomenti (es. `nlp`) e l'app ti segnala i paper nuovi su arXiv.
3. **Stato dell'arte** — dai un argomento (es. *entity linking*), cerca i ~10 paper più rilevanti e li comprime in una sintesi unica con citazioni `[n]`.

Più un **digest email** automatico ogni mattina e uno scrape automatico ogni 2 ore.

Costruita interamente con AI (Homework 01). Niente codice scritto a mano.

## Stack & scelte

| Cosa | Strumento | Chiave? |
|------|-----------|---------|
| News | GDELT + RSS (BBC, Guardian, Al Jazeera…) | no |
| Paper | arXiv API | no |
| Sintesi/raggruppamento | OpenRouter (modello free di default) | sì (tua) |
| Email | SMTP (Gmail app-password) | opzionale |
| Backend | Python + FastAPI + APScheduler | — |
| Frontend | React + Vite | — |

Tutto gira **in locale**. L'unica chiave necessaria è quella OpenRouter; l'email è opzionale (senza credenziali, il digest resta visibile nell'app invece di essere spedito).

## Setup

### 1. Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env             # poi apri .env e incolla la tua OPENROUTER_API_KEY
uvicorn main:app --reload --port 8000
```

### 2. Frontend (in un secondo terminale)

```bash
cd frontend
npm install
npm run dev
```

Apri **http://localhost:5173**. Il frontend fa proxy delle chiamate `/api` verso il backend su `:8000`.

## Configurazione (`backend/.env`)

- `OPENROUTER_API_KEY` — obbligatoria.
- `OPENROUTER_MODEL` — default `google/gemini-2.0-flash-exp:free`. Cambialo se vuoi.
- `SMTP_*` + `DIGEST_TO` — opzionali, per il digest mattutino via email. Per Gmail crea una *App Password* (https://myaccount.google.com/apppasswords).
- `SCRAPE_EVERY_HOURS` — default 2.
- `DIGEST_HOUR` / `DIGEST_MINUTE` — orario del digest.

## Come funziona

- Lo scheduler fa uno scrape delle news ogni `SCRAPE_EVERY_HOURS` ore e tiene una cache locale (`store.json`). Il bottone **Refresh** forza uno scrape immediato.
- Il **raggruppamento per topic** manda i titoli all'LLM che li clusterizza, riassume e indica quali articoli ha usato come fonti.
- Il **paper watch** ricorda gli ID arXiv già visti (in `store.json`), così "Solo novità" mostra davvero solo ciò che è uscito dall'ultima volta.
- Lo **stato dell'arte** lavora su titoli + abstract (non scarica i PDF): è una sintesi a grandi linee, pensata come punto di partenza — per la profondità apri i paper citati.

## Limiti noti (è un lavoro scolastico)

- GDELT a volte risponde a vuoto sotto rate limit: in quel caso restano gli RSS.
- I modelli free di OpenRouter hanno rate limit propri; se la sintesi fallisce, riprova.
- Persistenza su file JSON, non un vero DB. Sufficiente per uso locale.
