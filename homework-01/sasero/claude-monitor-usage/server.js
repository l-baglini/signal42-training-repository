#!/usr/bin/env node
const express            = require("express");
const fs                 = require("fs");
const path               = require("path");
const os                 = require("os");
const crypto             = require("crypto");
const { execSync, spawn } = require("child_process");

const app  = express();
const PORT = 3456;

const ORG_ID    = "1d446918-be83-48a3-9278-fc69f8f8a238";
const USAGE_URL = `https://claude.ai/api/organizations/${ORG_ID}/usage`;

// ─────────────────────────────────────────────────────────────────────────────
// MOCK MODE — for testing the ESP32 faces without hitting claude.ai.
// Set MOCK=<keyword|number> (see npm run happy/neutral/sad/angry/tired).
//   keyword → a representative worst_pct for that face tier
//   number  → that exact percentage
//   "tired"/"error" → /usage returns 500, so the firmware shows the TIRED face
// ─────────────────────────────────────────────────────────────────────────────
const MOCK = process.env.MOCK || null;
const MOCK_TIERS = { happy: 25, neutral: 55, sad: 80, angry: 95 };

function resolveMock() {
  if (!MOCK) return null;
  const key = MOCK.trim().toLowerCase();
  if (key === "tired" || key === "error") return "error";
  if (key in MOCK_TIERS) return MOCK_TIERS[key];
  const n = parseInt(key, 10);
  return Number.isNaN(n) ? null : Math.max(0, Math.min(100, n));
}

// Build a /usage payload identical in shape to fetchUsage()'s, for a given pct.
function mockUsage(pct) {
  const sessionPct = pct;
  const weeklyPct  = Math.max(0, pct - 12);   // slightly different so the bars differ
  const worstPct   = Math.max(sessionPct, weeklyPct);
  return {
    session_pct:           sessionPct,
    session_reset_minutes: 137,
    session_resets_at:     null,
    weekly_pct:            weeklyPct,
    weekly_resets_at:      null,
    weekly_reset_minutes:  5400,
    mood:                  moodFromPct(worstPct),
    worst_pct:             worstPct,
    timestamp:             new Date().toISOString(),
    mock:                  true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CHROME COOKIE AUTO-READER
// Reads __cf_clearance + sessionKey directly from Chrome's SQLite cookie store.
// Chrome on Linux encrypts cookies with AES-128-CBC; key = PBKDF2(password,
// "saltysalt", 1 iter, 16 bytes, sha1) where password comes from GNOME keyring
// or defaults to "peanuts" on systems without a keyring.
// ─────────────────────────────────────────────────────────────────────────────

let Database = null;
try { Database = require("better-sqlite3"); } catch {
  console.warn('[cookies] better-sqlite3 not installed — run npm install');
}

const CHROME_DB_PATHS = [
  // Snap Chromium (Ubuntu)
  path.join(os.homedir(), "snap/chromium/common/chromium/Profile 2/Cookies"),
  path.join(os.homedir(), "snap/chromium/common/chromium/Profile 1/Cookies"),
  path.join(os.homedir(), "snap/chromium/common/chromium/Default/Cookies"),
  // Native Chrome / Chromium
  path.join(os.homedir(), ".config/google-chrome/Default/Cookies"),
  path.join(os.homedir(), ".config/chromium/Default/Cookies"),
  path.join(os.homedir(), ".config/google-chrome/Profile 1/Cookies"),
];

function getDecryptPasswords() {
  const passwords = [];
  // Try KWallet (KDE)
  try {
    const kw = execSync(
      'kwallet-query -r "Chromium Safe Storage" -f "Chromium Keys" kdewallet',
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 2000 }
    ).trim();
    if (kw) passwords.push(kw);
  } catch {}
  // Try GNOME keyring
  for (const app of ["chrome", "chromium"]) {
    try {
      const kw = execSync(`secret-tool lookup application ${app}`, {
        encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 1000,
      }).trim();
      if (kw) passwords.push(kw);
    } catch {}
  }
  passwords.push("peanuts", "");
  return passwords;
}

function decryptChromeValue(buf, passwords) {
  if (!buf || buf.length < 3) return "";
  const raw = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  const magic = raw.subarray(0, 3).toString("ascii");
  if (magic !== "v10" && magic !== "v11") {
    return raw.toString("utf8").replace(/\0/g, "");
  }
  const iv = Buffer.alloc(16, 0x20); // 16 spaces

  for (const pwd of passwords) {
    // Try both standard offset (3) and skip-16 offset (19) — snap Chromium
    // prepends a 16-byte internal header before the CBC ciphertext.
    for (const offset of [3, 19]) {
      const ciphertext = raw.subarray(offset);
      if (ciphertext.length === 0 || ciphertext.length % 16 !== 0) continue;
      try {
        const key = crypto.pbkdf2Sync(pwd, "saltysalt", 1, 16, "sha1");
        const dc  = crypto.createDecipheriv("aes-128-cbc", key, iv);
        dc.setAutoPadding(true);
        const decrypted = Buffer.concat([dc.update(ciphertext), dc.final()])
          .toString("utf8").replace(/\0/g, "");
        // Extract the first long run of printable ASCII — this is the real cookie value.
        // The first block is often garbled due to an unknown IV; ignore it.
        // First AES block is often garbled (IV mismatch); skip non-alphanumeric leaders.
        const match = decrypted.match(/[a-zA-Z0-9][\x20-\x7e]{15,}/);
        if (match) return match[0];
      } catch {}
    }
  }
  return "";
}

let cookieCache    = {};
let cookieFetchedAt = 0;
const COOKIE_TTL_MS = 4 * 60 * 1000; // re-read Chrome DB every 4 min

function readChromeCookies() {
  if (!Database) return {};
  const dbPath = CHROME_DB_PATHS.find(p => fs.existsSync(p));
  if (!dbPath) return {};

  const passwords = getDecryptPasswords();
  let db = null;
  let tmpPath = null;

  try {
    // Try read-only direct open first (works fine while Chrome is running via WAL)
    try {
      db = new Database(dbPath, { readonly: true, fileMustExist: true });
    } catch {
      // Fallback: copy DB + WAL files to avoid any lock
      tmpPath = path.join(os.tmpdir(), `chrome_cookies_${process.pid}.db`);
      fs.copyFileSync(dbPath, tmpPath);
      for (const ext of ["-wal", "-shm"]) {
        if (fs.existsSync(dbPath + ext)) fs.copyFileSync(dbPath + ext, tmpPath + ext);
      }
      db = new Database(tmpPath, { readonly: true, fileMustExist: true });
    }

    const rows = db.prepare(
      "SELECT name, value, encrypted_value FROM cookies " +
      "WHERE host_key IN ('.claude.ai', 'claude.ai')"
    ).all();

    const cookies = {};
    for (const { name, value, encrypted_value } of rows) {
      const v = value || decryptChromeValue(encrypted_value, passwords);
      if (v) cookies[name] = v;
    }
    return cookies;
  } catch (err) {
    console.warn("[cookies] Read failed:", err.message);
    return {};
  } finally {
    try { db?.close(); } catch {}
    if (tmpPath) {
      for (const f of [tmpPath, tmpPath + "-wal", tmpPath + "-shm"]) {
        try { fs.unlinkSync(f); } catch {}
      }
    }
  }
}

function getCookies() {
  if (Date.now() - cookieFetchedAt < COOKIE_TTL_MS) return cookieCache;

  const fresh = readChromeCookies();
  // Env var overrides (manual fallback if Chrome isn't running)
  if (process.env.CF_CLEARANCE) fresh["__cf_clearance"] = process.env.CF_CLEARANCE;
  if (process.env.SESSION_KEY)  fresh["sessionKey"]      = process.env.SESSION_KEY;

  cookieCache    = fresh;
  cookieFetchedAt = Date.now();

  const have = (k) => fresh[k] ? "✓" : "✗";
  console.log(`[cookies] cf_clearance:${have("cf_clearance")}  sessionKey:${have("sessionKey")}`);
  return cookieCache;
}

// ─────────────────────────────────────────────────────────────────────────────
// USAGE FETCHING
// ─────────────────────────────────────────────────────────────────────────────

function minutesUntil(iso) {
  if (!iso) return null;
  return Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 60_000));
}

function moodFromPct(pct) {
  if (pct < 40) return "happy";
  if (pct < 70) return "neutral";
  if (pct < 90) return "sad";
  return "angry";
}

// Use curl for the usage endpoint: curl's TLS fingerprint bypasses Cloudflare,
// and the claude.ai usage API authenticates via sessionKey cookie (not Bearer token).
async function fetchUsageViaCurl() {
  const cookies   = getCookies();
  const cookieStr = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; ");

  const args = [
    "--silent", "--show-error",
    "--max-time", "15",
    "--write-out", "\n%{http_code}",
    "-H", "Accept: application/json",
    "-H", "Accept-Language: en-US,en;q=0.9",
    "-H", "User-Agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "-H", "Referer: https://claude.ai/",
    "-H", "Origin: https://claude.ai",
    "-H", "sec-fetch-dest: empty",
    "-H", "sec-fetch-mode: cors",
    "-H", "sec-fetch-site: same-origin",
  ];
  if (cookieStr) args.push("-H", `Cookie: ${cookieStr}`);
  args.push(USAGE_URL);

  return new Promise((resolve, reject) => {
    const proc = spawn("curl", args);
    let out = "", err = "";
    proc.stdout.on("data", d => out += d);
    proc.stderr.on("data", d => err += d);
    proc.on("close", code => {
      if (code !== 0) return reject(new Error(`curl exited ${code}: ${err.trim()}`));
      const lines  = out.trimEnd().split("\n");
      const status = parseInt(lines.pop(), 10);
      const body   = lines.join("\n");
      try   { resolve({ status, body: JSON.parse(body) }); }
      catch { resolve({ status, body }); }
    });
  });
}

async function fetchUsage() {
  const result = await fetchUsageViaCurl();

  if (result.status === 403 && typeof result.body === "string" && result.body.includes("cf_chl")) {
    cookieFetchedAt = 0; // invalidate cache so next attempt re-reads Chrome
    throw new Error(
      "Cloudflare blocked (403). Make sure Chromium is open and signed in to claude.ai."
    );
  }
  if (result.status !== 200) {
    throw new Error(`Usage API HTTP ${result.status}: ${JSON.stringify(result.body)}`);
  }

  const d          = result.body;
  const sessionPct = Math.round(d.five_hour?.utilization ?? 0);
  const weeklyPct  = Math.round(d.seven_day?.utilization  ?? 0);
  const worstPct   = Math.max(sessionPct, weeklyPct);

  return {
    session_pct:           sessionPct,
    session_reset_minutes: minutesUntil(d.five_hour?.resets_at),
    session_resets_at:     d.five_hour?.resets_at ?? null,
    weekly_pct:            weeklyPct,
    weekly_resets_at:      d.seven_day?.resets_at ?? null,
    weekly_reset_minutes:  minutesUntil(d.seven_day?.resets_at),
    mood:                  moodFromPct(worstPct),
    worst_pct:             worstPct,
    timestamp:             new Date().toISOString(),
  };
}

let usageCache     = null;
let usageFetchedAt = 0;
const CACHE_TTL_MS = 60_000;

async function getCachedUsage() {
  const mock = resolveMock();
  if (mock !== null) {
    if (mock === "error") throw new Error(`Mock TIRED face (MOCK=${MOCK})`);
    return mockUsage(mock);
  }
  if (!usageCache || Date.now() - usageFetchedAt > CACHE_TTL_MS) {
    usageCache    = await fetchUsage();
    usageFetchedAt = Date.now();
    console.log(`[${new Date().toLocaleTimeString()}] session=${usageCache.session_pct}% weekly=${usageCache.weekly_pct}% mood=${usageCache.mood}`);
  }
  return usageCache;
}

// ─────────────────────────────────────────────────────────────────────────────
// ROUTES
// ─────────────────────────────────────────────────────────────────────────────

app.get("/usage", async (_req, res) => {
  try {
    res.json(await getCachedUsage());
  } catch (err) {
    console.error("[error]", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get("/", (_req, res) => {
  res.send(`<h2>Claude Usage Proxy</h2><p><a href="/usage">GET /usage</a></p>`);
});

// ─────────────────────────────────────────────────────────────────────────────
// START
// ─────────────────────────────────────────────────────────────────────────────

app.listen(PORT, "0.0.0.0", async () => {
  console.log(`\n✅  Claude usage proxy  http://0.0.0.0:${PORT}`);
  console.log(`   Org      : ${ORG_ID}`);
  console.log(`   Endpoint : http://<your-pc-ip>:${PORT}/usage`);
  if (MOCK) {
    const m = resolveMock();
    console.log(`   🧪 MOCK   : ${MOCK}` + (m === "error" ? "  → 500 / TIRED face" : `  → worst_pct ≈ ${m}%`));
  }
  console.log("");
  try   { await getCachedUsage(); }
  catch (e) { console.warn("[warn]", e.message); }
});
