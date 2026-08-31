import { useState, useEffect, useCallback } from "react";

const API = "/api";

function Spinner({ label }) {
  return <div className="note"><span className="spinner" />{label}</div>;
}

// Minimal markdown -> HTML (headings, bold, code, lists, paragraphs).
function renderMarkdown(md) {
  if (!md) return "";
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const lines = esc(md).split("\n");
  let html = "", inList = false;
  for (let line of lines) {
    if (/^### /.test(line)) { if (inList) { html += "</ul>"; inList = false; } html += `<h3>${line.slice(4)}</h3>`; }
    else if (/^## /.test(line)) { if (inList) { html += "</ul>"; inList = false; } html += `<h2>${line.slice(3)}</h2>`; }
    else if (/^# /.test(line)) { if (inList) { html += "</ul>"; inList = false; } html += `<h1>${line.slice(2)}</h1>`; }
    else if (/^[-*] /.test(line)) { if (!inList) { html += "<ul>"; inList = true; } html += `<li>${line.slice(2)}</li>`; }
    else if (line.trim() === "") { if (inList) { html += "</ul>"; inList = false; } }
    else { if (inList) { html += "</ul>"; inList = false; } html += `<p>${line}</p>`; }
  }
  if (inList) html += "</ul>";
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
             .replace(/`([^`]+)`/g, "<code>$1</code>");
  return html;
}

function Masthead({ status }) {
  const ok = status?.openrouter_key_set;
  const mail = status?.smtp_configured;
  const last = status?.last_scrape
    ? new Date(status.last_scrape).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })
    : "—";
  return (
    <div className="masthead">
      <div className="brand">news<span className="blip">·</span>desk</div>
      <div className="meta">
        <div>LLM <span className={ok ? "dot" : "dot off"}>●</span> {status?.model || "…"}</div>
        <div>EMAIL <span className={mail ? "dot" : "dot off"}>●</span> · ultimo scrape {last}</div>
      </div>
    </div>
  );
}

function NewsTab() {
  const [articles, setArticles] = useState([]);
  const [groups, setGroups] = useState([]);
  const [topic, setTopic] = useState("");
  const [loading, setLoading] = useState(false);
  const [grouping, setGrouping] = useState(false);

  const load = useCallback(async (t) => {
    setLoading(true);
    try {
      const url = t ? `${API}/news?topic=${encodeURIComponent(t)}` : `${API}/news`;
      const r = await fetch(url);
      const d = await r.json();
      setArticles(d.articles || []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(""); }, [load]);

  const refresh = async () => {
    setLoading(true);
    await fetch(`${API}/refresh`, { method: "POST" });
    await load(topic);
  };

  const group = async () => {
    setGrouping(true);
    try {
      const r = await fetch(`${API}/news/group`, { method: "POST" });
      const d = await r.json();
      setGroups(d.groups || []);
    } finally { setGrouping(false); }
  };

  const presets = ["Iran", "AI", "Ukraine", "Economia", "Tech"];

  return (
    <>
      <div className="bar">
        <input type="text" placeholder="filtra per argomento (es. iran)…"
          value={topic} onChange={(e) => setTopic(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load(topic)} />
        <button className="act" onClick={() => load(topic)}>Cerca</button>
        <button className="ghost" onClick={refresh}>↻ Refresh</button>
        <button className="ghost" onClick={group} disabled={grouping}>
          {grouping ? "Raggruppo…" : "Raggruppa per topic"}
        </button>
      </div>
      <div className="chips">
        {presets.map((p) => (
          <span key={p} className="chip" onClick={() => { setTopic(p); load(p); }}>{p}</span>
        ))}
      </div>

      {groups.length > 0 && (
        <>
          <div className="eyebrow">Topic della giornata</div>
          {groups.map((g, i) => (
            <div className="group" key={i}>
              <h3>{g.topic}</h3>
              <p>{g.summary}</p>
              <div className="sources">
                {g.sources.map((s, j) => (
                  <a key={j} href={s.url} target="_blank" rel="noreferrer">↳ {s.title} · {s.source}</a>
                ))}
              </div>
            </div>
          ))}
        </>
      )}

      <div className="eyebrow">{topic ? `Risultati · ${topic}` : "Ultime notizie"}</div>
      {loading ? <Spinner label="Carico le notizie…" /> :
        articles.length === 0 ? <div className="note">Nessuna notizia. Prova un Refresh o un altro argomento.</div> :
        articles.map((a, i) => (
          <div className="row" key={i}>
            <a className="headline" href={a.url} target="_blank" rel="noreferrer">{a.title}</a>
            <span className="src">{a.source}</span>
          </div>
        ))
      }
    </>
  );
}

function PapersTab() {
  const [topics, setTopics] = useState("nlp");
  const [papers, setPapers] = useState([]);
  const [newOnly, setNewOnly] = useState([]);
  const [loading, setLoading] = useState(false);

  const search = async () => {
    setLoading(true);
    try {
      const first = topics.split(",")[0].trim();
      const r = await fetch(`${API}/papers?topic=${encodeURIComponent(first)}`);
      const d = await r.json();
      setPapers(d.papers || []);
    } finally { setLoading(false); }
  };

  const checkNew = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/papers/new?topics=${encodeURIComponent(topics)}`);
      const d = await r.json();
      setNewOnly(d.new_papers || []);
    } finally { setLoading(false); }
  };

  return (
    <>
      <div className="bar">
        <input type="text" placeholder="topic seguiti, separati da virgola (es. nlp, computer vision)"
          value={topics} onChange={(e) => setTopics(e.target.value)} />
        <button className="act" onClick={search}>Ultimi paper</button>
        <button className="ghost" onClick={checkNew}>Solo novità</button>
      </div>

      {loading && <Spinner label="Interrogo arXiv…" />}

      {newOnly.length > 0 && (
        <>
          <div className="eyebrow">Novità dall'ultimo controllo · {newOnly.length}</div>
          {newOnly.map((p, i) => (
            <div className="paper" key={i}>
              <div className="title">
                <a className="headline" href={p.url} target="_blank" rel="noreferrer">{p.title}</a>
                <span className="tag">{p.watched_topic}</span>
              </div>
              <div className="authors">{p.authors.slice(0, 5).join(", ")}{p.authors.length > 5 ? " et al." : ""}</div>
            </div>
          ))}
        </>
      )}

      {papers.length > 0 && (
        <>
          <div className="eyebrow">Ultimi paper</div>
          {papers.map((p, i) => (
            <div className="paper" key={i}>
              <div className="title">
                <a className="headline" href={p.url} target="_blank" rel="noreferrer">{p.title}</a>
              </div>
              <div className="authors">{p.authors.slice(0, 5).join(", ")}{p.authors.length > 5 ? " et al." : ""}</div>
              <div className="abstract">{p.summary.slice(0, 320)}…</div>
              <a className="link" href={p.url} target="_blank" rel="noreferrer">arxiv ↗</a>
            </div>
          ))}
        </>
      )}
    </>
  );
}

function SotaTab() {
  const [topic, setTopic] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    if (!topic.trim()) return;
    setLoading(true); setData(null);
    try {
      const r = await fetch(`${API}/sota`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic }),
      });
      setData(await r.json());
    } finally { setLoading(false); }
  };

  return (
    <>
      <div className="bar">
        <input type="text" placeholder="argomento da esplorare (es. entity linking)…"
          value={topic} onChange={(e) => setTopic(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && run()} />
        <button className="act" onClick={run} disabled={loading}>Genera stato dell'arte</button>
      </div>
      <p className="note" style={{ padding: "0 0 8px", textAlign: "left" }}>
        Cerca i ~10 paper più rilevanti su arXiv e li comprime in una sintesi con citazioni.
      </p>

      {loading && <Spinner label="Cerco i paper e sintetizzo… (può richiedere un minuto)" />}

      {data && (
        <>
          <div className="report" dangerouslySetInnerHTML={{ __html: renderMarkdown(data.report) }} />
          {data.papers?.length > 0 && (
            <div className="refs">
              <div className="eyebrow">Riferimenti</div>
              {data.papers.map((p) => (
                <div className="ref" key={p.n}>
                  [{p.n}] <a href={p.url} target="_blank" rel="noreferrer">{p.title}</a>
                  {" — "}{p.authors.slice(0, 3).join(", ")}{p.authors.length > 3 ? " et al." : ""}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}

function DigestTab() {
  const [html, setHtml] = useState("");
  const [loading, setLoading] = useState(false);

  const load = async () => {
    const r = await fetch(`${API}/digest`);
    const d = await r.json();
    setHtml(d.html || "");
  };
  useEffect(() => { load(); }, []);

  const runNow = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/digest/run`, { method: "POST" });
      const d = await r.json();
      setHtml(d.html || "");
    } finally { setLoading(false); }
  };

  return (
    <>
      <div className="bar">
        <button className="act" onClick={runNow} disabled={loading}>
          {loading ? "Genero…" : "Genera digest ora"}
        </button>
        <span className="src" style={{ color: "var(--muted)" }}>
          Inviato in automatico ogni mattina (se SMTP configurato).
        </span>
      </div>
      <div className="digest-html" dangerouslySetInnerHTML={{ __html: html }} />
    </>
  );
}

export default function App() {
  const [tab, setTab] = useState("news");
  const [status, setStatus] = useState(null);

  useEffect(() => {
    fetch(`${API}/status`).then((r) => r.json()).then(setStatus).catch(() => {});
  }, []);

  return (
    <div className="shell">
      <Masthead status={status} />
      <div className="tabs">
        <button className={`tab ${tab === "news" ? "active" : ""}`} onClick={() => setTab("news")}>NOTIZIE</button>
        <button className={`tab ${tab === "papers" ? "active" : ""}`} onClick={() => setTab("papers")}>PAPER WATCH</button>
        <button className={`tab ${tab === "sota" ? "active" : ""}`} onClick={() => setTab("sota")}>STATO DELL'ARTE</button>
        <button className={`tab ${tab === "digest" ? "active" : ""}`} onClick={() => setTab("digest")}>DIGEST</button>
      </div>
      {tab === "news" && <NewsTab />}
      {tab === "papers" && <PapersTab />}
      {tab === "sota" && <SotaTab />}
      {tab === "digest" && <DigestTab />}
    </div>
  );
}
