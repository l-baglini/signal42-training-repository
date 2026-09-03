import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import DatabaseCtor from "better-sqlite3";
import { createDb } from "../src/db";

let tmpPath: string;

afterEach(() => {
  for (const suffix of ["", "-wal", "-shm"]) {
    const p = tmpPath + suffix;
    if (fs.existsSync(p)) fs.rmSync(p);
  }
});

describe("schema migration", () => {
  it("backfills dish from a pre-existing order_text column, without losing data", () => {
    tmpPath = path.join(os.tmpdir(), `lunch-manager-migration-test-${Date.now()}.sqlite`);

    // Simulate a database file created before the "menu items" feature.
    const oldDb = new DatabaseCtor(tmpPath);
    oldDb.exec(`
      CREATE TABLE venues (
        id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, mode TEXT NOT NULL,
        cutoff_time TEXT NOT NULL, contact TEXT, active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT, venue_id INTEGER NOT NULL, date TEXT NOT NULL,
        person_name TEXT NOT NULL, mode TEXT NOT NULL, order_text TEXT NOT NULL,
        edit_token TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')),
        cancelled_at TEXT
      );
    `);
    oldDb.prepare("INSERT INTO venues (name, mode, cutoff_time) VALUES ('Mensa', 'dine_in', '10:30')").run();
    oldDb
      .prepare(
        `INSERT INTO requests (venue_id, date, person_name, mode, order_text, edit_token)
         VALUES (1, '2026-07-24', 'Marco', 'dine_in', 'Pasta al pomodoro', 'tok')`,
      )
      .run();
    oldDb.close();

    // This is exactly what app startup does against an existing database file.
    const db = createDb(tmpPath);

    const columns = db.prepare("PRAGMA table_info(requests)").all() as { name: string }[];
    expect(columns.some((c) => c.name === "dish")).toBe(true);
    expect(columns.some((c) => c.name === "note")).toBe(true);

    const row = db.prepare("SELECT dish, note, person_name FROM requests WHERE id = 1").get() as {
      dish: string;
      note: string | null;
      person_name: string;
    };
    expect(row.dish).toBe("Pasta al pomodoro");
    expect(row.person_name).toBe("Marco");

    db.close();
  });

  it("is a no-op against a database that already has the current schema", () => {
    tmpPath = path.join(os.tmpdir(), `lunch-manager-migration-test-${Date.now()}-b.sqlite`);
    const db1 = createDb(tmpPath);
    db1.close();

    // Reopening (createDb runs its schema/migration step again) must not error.
    const db2 = createDb(tmpPath);
    const columns = db2.prepare("PRAGMA table_info(requests)").all() as { name: string }[];
    expect(columns.filter((c) => c.name === "dish")).toHaveLength(1);
    db2.close();
  });
});
