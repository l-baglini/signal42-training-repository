import fs from "fs";
import path from "path";
import Database from "better-sqlite3";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS venues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('dine_in','takeaway','both')),
  cutoff_time TEXT NOT NULL,
  contact TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS menu_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  venue_id INTEGER NOT NULL REFERENCES venues(id),
  name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_menu_items_venue ON menu_items(venue_id);

CREATE TABLE IF NOT EXISTS requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  venue_id INTEGER NOT NULL REFERENCES venues(id),
  date TEXT NOT NULL,
  person_name TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('dine_in','takeaway')),
  dish TEXT NOT NULL,
  note TEXT,
  edit_token TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  cancelled_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_requests_date ON requests(date);

CREATE TABLE IF NOT EXISTS sent_marks (
  venue_id INTEGER NOT NULL REFERENCES venues(id),
  date TEXT NOT NULL,
  sent_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (venue_id, date)
);
`;

/**
 * `CREATE TABLE IF NOT EXISTS` above is a no-op against a database file that
 * predates the "menu items" feature — it would silently leave requests
 * without the new dish/note columns. This is a one-off repair for that
 * single known transition, not a general migrations framework (see SPEC
 * non-goals) — the app has never needed more than this.
 */
function migrateRequestsTable(db: Database.Database): void {
  const columns = db.prepare("PRAGMA table_info(requests)").all() as { name: string }[];
  const names = new Set(columns.map((c) => c.name));
  if (names.has("dish")) return; // already the current schema

  db.exec("ALTER TABLE requests ADD COLUMN dish TEXT");
  db.exec("ALTER TABLE requests ADD COLUMN note TEXT");
  if (names.has("order_text")) {
    db.exec("UPDATE requests SET dish = order_text WHERE dish IS NULL");
  }
}

export function createDb(databasePath: string): Database.Database {
  if (databasePath !== ":memory:") {
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  }
  const db = new Database(databasePath);
  db.pragma("journal_mode = WAL");
  db.exec(SCHEMA);
  migrateRequestsTable(db);
  return db;
}

export function seedIfEmpty(db: Database.Database): void {
  const { count } = db
    .prepare("SELECT COUNT(*) AS count FROM venues")
    .get() as { count: number };
  if (count > 0) return;

  const insertVenue = db.prepare(
    `INSERT INTO venues (name, mode, cutoff_time, contact) VALUES (?, ?, ?, ?)`,
  );
  const insertMenuItem = db.prepare(
    `INSERT INTO menu_items (venue_id, name) VALUES (?, ?)`,
  );

  const seed = db.transaction(() => {
    const mensaId = insertVenue.run("Mensa aziendale", "dine_in", "10:30", null)
      .lastInsertRowid;
    ["Pasta al pomodoro", "Riso e verdure", "Insalata mista"].forEach((item) =>
      insertMenuItem.run(mensaId, item),
    );

    const ginoId = insertVenue.run(
      "Trattoria Da Gino",
      "both",
      "11:00",
      "+39 011 1234567",
    ).lastInsertRowid;
    ["Margherita", "Cotoletta alla milanese", "Tagliere misto"].forEach((item) =>
      insertMenuItem.run(ginoId, item),
    );

    const pokeId = insertVenue.run(
      "Poke House",
      "takeaway",
      "11:30",
      "+39 011 7654321",
    ).lastInsertRowid;
    ["Salmon bowl", "Tuna bowl", "Veggie bowl"].forEach((item) =>
      insertMenuItem.run(pokeId, item),
    );
  });
  seed();
}
