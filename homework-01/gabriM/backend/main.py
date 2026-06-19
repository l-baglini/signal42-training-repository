"""NewsDesk backend — FastAPI app.

Endpoints:
  GET  /api/news?topic=...        -> latest news (optionally filtered)
  POST /api/news/group            -> cluster current news into topics (LLM)
  GET  /api/papers?topic=...      -> newest arXiv papers for a topic
  GET  /api/papers/new?topics=... -> only papers not seen before (paper watch)
  POST /api/sota                  -> state-of-the-art report for a topic
  POST /api/refresh               -> force a scrape now
  GET  /api/digest                -> last morning digest (HTML)
  GET  /api/status                -> config + last scrape info
"""
import os
import json
import asyncio
from datetime import datetime, timezone
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from apscheduler.schedulers.asyncio import AsyncIOScheduler

import news as news_mod
import arxiv as arxiv_mod
import llm
import mailer

load_dotenv()

# ---------------------------------------------------------------------------
# Tiny JSON "database" for dedup + caching (homework-grade persistence).
# ---------------------------------------------------------------------------
DB_PATH = os.path.join(os.path.dirname(__file__), "store.json")


def _load_db() -> dict:
    if os.path.exists(DB_PATH):
        try:
            with open(DB_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {"seen_papers": [], "last_scrape": None, "cached_news": [], "last_digest": None}


def _save_db(db: dict) -> None:
    with open(DB_PATH, "w", encoding="utf-8") as f:
        json.dump(db, f, ensure_ascii=False, indent=2)


DB = _load_db()


# ---------------------------------------------------------------------------
# Core logic
# ---------------------------------------------------------------------------
async def group_news_by_topic(articles: list[dict]) -> list[dict]:
    """Use the LLM to cluster headlines into topics with a short synthesis + sources."""
    if not articles:
        return []
    # Limita il payload per stare leggeri sui modelli free.
    sample = articles[:40]
    headlines = "\n".join(
        f"{i}. {a['title']} — {a['source']} ({a['url']})"
        for i, a in enumerate(sample)
    )
    system = ("Sei un redattore. Raggruppi titoli di news in pochi topic coerenti "
              "(es. 'Medio Oriente', 'Elezioni USA', 'Tecnologia/AI'). "
              "Per ogni topic scrivi un riassunto di 2-3 frasi e CITI le fonti usando "
              "gli indici degli articoli.")
    prompt = (
        f"Ecco i titoli di oggi (indice. titolo — fonte (url)):\n\n{headlines}\n\n"
        "Restituisci SOLO JSON valido con questa forma:\n"
        '[{"topic": "...", "summary": "...", "article_indices": [0,3,5]}]\n'
        "Massimo 6 topic. Usa solo gli indici presenti sopra."
    )
    try:
        groups = await llm.chat_json(prompt, system=system, max_tokens=1800)
    except llm.LLMError:
        return []

    result = []
    if isinstance(groups, list):
        for g in groups:
            idxs = g.get("article_indices", []) if isinstance(g, dict) else []
            srcs = [sample[i] for i in idxs if isinstance(i, int) and 0 <= i < len(sample)]
            result.append({
                "topic": g.get("topic", "Senza titolo"),
                "summary": g.get("summary", ""),
                "sources": [{"title": s["title"], "url": s["url"], "source": s["source"]}
                            for s in srcs],
            })
    return result


async def build_sota_report(topic: str) -> dict:
    """Compress ~10 papers into one short state-of-the-art report with citations."""
    papers = await arxiv_mod.search_relevant(topic, max_results=10)
    if not papers:
        return {"topic": topic, "report": "Nessun paper trovato su arXiv per questo argomento.",
                "papers": []}

    refs = []
    for i, p in enumerate(papers):
        authors = ", ".join(p["authors"][:3]) + (" et al." if len(p["authors"]) > 3 else "")
        refs.append(f"[{i+1}] {p['title']} — {authors}\n     Abstract: {p['summary'][:700]}")
    refs_block = "\n\n".join(refs)

    system = ("Sei un ricercatore che scrive una sintesi dello stato dell'arte. "
              "Lavori SOLO su titoli e abstract forniti. Scrivi in italiano, in modo "
              "chiaro e tecnico ma accessibile. Cita i paper con la notazione [n].")
    prompt = (
        f"Argomento: {topic}\n\n"
        f"Paper disponibili (abstract):\n\n{refs_block}\n\n"
        "Scrivi una sintesi dello stato dell'arte in markdown, max ~800 parole, con:\n"
        "1. Una panoramica del problema\n"
        "2. Gli approcci principali e come si differenziano (citando [n])\n"
        "3. Tendenze recenti e questioni aperte\n"
        "Usa i riferimenti [n] nel testo. Non inventare risultati non presenti negli abstract."
    )
    try:
        report = await llm.chat(prompt, system=system, max_tokens=2000)
    except llm.LLMError as e:
        report = f"Errore nella generazione del report: {e}"

    return {
        "topic": topic,
        "report": report,
        "papers": [{
            "n": i + 1,
            "title": p["title"],
            "authors": p["authors"],
            "url": p["url"],
            "published": p["published"],
        } for i, p in enumerate(papers)],
    }


async def scrape_now() -> dict:
    """Fetch general news, cache them, return summary info."""
    articles = await news_mod.fetch_news(None)
    DB["cached_news"] = articles[:60]
    DB["last_scrape"] = datetime.now(timezone.utc).isoformat()
    _save_db(DB)
    return {"count": len(articles), "last_scrape": DB["last_scrape"]}


async def find_new_papers(topics: list[str]) -> list[dict]:
    """Return papers for the watched topics that we haven't seen before."""
    seen = set(DB.get("seen_papers", []))
    fresh = []
    for t in topics:
        papers = await arxiv_mod.latest_by_topic(t, max_results=10)
        for p in papers:
            if p["id"] and p["id"] not in seen:
                seen.add(p["id"])
                fresh.append({**p, "watched_topic": t})
    DB["seen_papers"] = list(seen)[-2000:]  # cap size
    _save_db(DB)
    return fresh


async def morning_digest() -> str:
    """Build + send the morning digest. Stored in DB regardless of email outcome."""
    await scrape_now()
    groups = await group_news_by_topic(DB.get("cached_news", []))

    parts = ["<h2>Il tuo digest mattutino</h2>",
             f"<p style='color:#666'>{datetime.now().strftime('%A %d %B %Y, %H:%M')}</p>"]
    for g in groups:
        parts.append(f"<h3>{g['topic']}</h3><p>{g['summary']}</p>")
        if g["sources"]:
            parts.append("<ul>")
            for s in g["sources"][:4]:
                parts.append(f"<li><a href='{s['url']}'>{s['title']}</a> — {s['source']}</li>")
            parts.append("</ul>")
    if not groups:
        parts.append("<p>Nessuna notizia raggruppabile al momento.</p>")

    html = "\n".join(parts)
    DB["last_digest"] = {"html": html, "generated": datetime.now(timezone.utc).isoformat()}
    _save_db(DB)

    ok, msg = mailer.send_digest("NewsDesk — digest mattutino", html)
    print(f"[digest] {msg}")
    return html


# ---------------------------------------------------------------------------
# Scheduler
# ---------------------------------------------------------------------------
scheduler = AsyncIOScheduler()


@asynccontextmanager
async def lifespan(app: FastAPI):
    every = int(os.getenv("SCRAPE_EVERY_HOURS", "2"))
    hour = int(os.getenv("DIGEST_HOUR", "8"))
    minute = int(os.getenv("DIGEST_MINUTE", "0"))

    scheduler.add_job(scrape_now, "interval", hours=every, id="scrape",
                      next_run_time=datetime.now())
    scheduler.add_job(lambda: asyncio.create_task(morning_digest()),
                      "cron", hour=hour, minute=minute, id="digest")
    scheduler.start()
    print(f"[scheduler] scrape ogni {every}h, digest alle {hour:02d}:{minute:02d}")
    yield
    scheduler.shutdown()


app = FastAPI(title="NewsDesk", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# API
# ---------------------------------------------------------------------------
class SotaReq(BaseModel):
    topic: str


@app.get("/api/status")
async def status():
    return {
        "last_scrape": DB.get("last_scrape"),
        "cached_news_count": len(DB.get("cached_news", [])),
        "smtp_configured": mailer.smtp_configured(),
        "model": os.getenv("OPENROUTER_MODEL", "google/gemini-2.0-flash-exp:free"),
        "openrouter_key_set": bool(os.getenv("OPENROUTER_API_KEY")),
    }


@app.get("/api/news")
async def get_news(topic: str | None = Query(default=None)):
    if topic:
        articles = await news_mod.fetch_news(topic)
    else:
        articles = DB.get("cached_news") or await news_mod.fetch_news(None)
    return {"articles": articles[:50], "topic": topic}


@app.post("/api/news/group")
async def post_group():
    articles = DB.get("cached_news") or await news_mod.fetch_news(None)
    groups = await group_news_by_topic(articles)
    return {"groups": groups}


@app.get("/api/papers")
async def get_papers(topic: str = Query(...)):
    papers = await arxiv_mod.latest_by_topic(topic, max_results=15)
    return {"papers": papers, "topic": topic}


@app.get("/api/papers/new")
async def get_new_papers(topics: str = Query(..., description="comma-separated")):
    topic_list = [t.strip() for t in topics.split(",") if t.strip()]
    fresh = await find_new_papers(topic_list)
    return {"new_papers": fresh, "count": len(fresh)}


@app.post("/api/sota")
async def post_sota(req: SotaReq):
    return await build_sota_report(req.topic)


@app.post("/api/refresh")
async def post_refresh():
    return await scrape_now()


@app.get("/api/digest")
async def get_digest():
    return DB.get("last_digest") or {"html": "<p>Nessun digest generato ancora.</p>"}


@app.post("/api/digest/run")
async def run_digest():
    html = await morning_digest()
    return {"html": html, "smtp_configured": mailer.smtp_configured()}
