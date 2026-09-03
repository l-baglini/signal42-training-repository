import type Database from "better-sqlite3";
import crypto from "crypto";
import type { LunchRequest, RequestMode, Venue, VenueMode } from "./types";

export function listActiveVenues(db: Database.Database): Venue[] {
  return db
    .prepare("SELECT * FROM venues WHERE active = 1 ORDER BY cutoff_time, name")
    .all() as Venue[];
}

export function getVenue(db: Database.Database, id: number): Venue | undefined {
  return db.prepare("SELECT * FROM venues WHERE id = ?").get(id) as Venue | undefined;
}

export function createVenue(
  db: Database.Database,
  input: { name: string; mode: VenueMode; cutoffTime: string; contact: string | null },
): Venue {
  const info = db
    .prepare(
      "INSERT INTO venues (name, mode, cutoff_time, contact) VALUES (?, ?, ?, ?)",
    )
    .run(input.name, input.mode, input.cutoffTime, input.contact);
  return getVenue(db, Number(info.lastInsertRowid))!;
}

export function listRequestsForDate(db: Database.Database, date: string): LunchRequest[] {
  return db
    .prepare(
      "SELECT * FROM requests WHERE date = ? AND cancelled_at IS NULL ORDER BY created_at",
    )
    .all(date) as LunchRequest[];
}

export function getRequestByToken(
  db: Database.Database,
  id: number,
  editToken: string,
): LunchRequest | undefined {
  return db
    .prepare("SELECT * FROM requests WHERE id = ? AND edit_token = ?")
    .get(id, editToken) as LunchRequest | undefined;
}

export function createRequest(
  db: Database.Database,
  input: {
    venueId: number;
    date: string;
    personName: string;
    mode: RequestMode;
    orderText: string;
  },
): LunchRequest {
  const editToken = crypto.randomBytes(16).toString("hex");
  const info = db
    .prepare(
      `INSERT INTO requests (venue_id, date, person_name, mode, order_text, edit_token)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(input.venueId, input.date, input.personName, input.mode, input.orderText, editToken);
  return db
    .prepare("SELECT * FROM requests WHERE id = ?")
    .get(info.lastInsertRowid) as LunchRequest;
}

export function updateRequest(
  db: Database.Database,
  id: number,
  input: { mode: RequestMode; orderText: string },
): void {
  db.prepare("UPDATE requests SET mode = ?, order_text = ? WHERE id = ?").run(
    input.mode,
    input.orderText,
    id,
  );
}

export function cancelRequest(db: Database.Database, id: number): void {
  db.prepare("UPDATE requests SET cancelled_at = datetime('now') WHERE id = ?").run(id);
}

export function isSent(db: Database.Database, venueId: number, date: string): boolean {
  const row = db
    .prepare("SELECT 1 FROM sent_marks WHERE venue_id = ? AND date = ?")
    .get(venueId, date);
  return !!row;
}

export function markSent(db: Database.Database, venueId: number, date: string): void {
  db.prepare(
    "INSERT OR REPLACE INTO sent_marks (venue_id, date, sent_at) VALUES (?, ?, datetime('now'))",
  ).run(venueId, date);
}

export function unmarkSent(db: Database.Database, venueId: number, date: string): void {
  db.prepare("DELETE FROM sent_marks WHERE venue_id = ? AND date = ?").run(venueId, date);
}
