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

CREATE TABLE IF NOT EXISTS requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  venue_id INTEGER NOT NULL REFERENCES venues(id),
  date TEXT NOT NULL,
  person_name TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('dine_in','takeaway')),
  order_text TEXT NOT NULL,
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

export function createDb(databasePath: string): Database.Database {
  if (databasePath !== ":memory:") {
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  }
  const db = new Database(databasePath);
  db.pragma("journal_mode = WAL");
  db.exec(SCHEMA);
  return db;
}

export function seedIfEmpty(db: Database.Database): void {
  const { count } = db
    .prepare("SELECT COUNT(*) AS count FROM venues")
    .get() as { count: number };
  if (count > 0) return;

  const insert = db.prepare(
    `INSERT INTO venues (name, mode, cutoff_time, contact) VALUES (?, ?, ?, ?)`,
  );
  const seed = db.transaction(() => {
    insert.run("Mensa aziendale", "dine_in", "10:30", null);
    insert.run("Trattoria Da Gino", "both", "11:00", "+39 011 1234567");
    insert.run("Poke House", "takeaway", "11:30", "+39 011 7654321");
  });
  seed();
}
