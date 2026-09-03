import { beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { createDb } from "../src/db";
import {
  cancelRequest,
  createRequest,
  createVenue,
  getRequestByToken,
  isSent,
  listRequestsForDate,
  markSent,
  unmarkSent,
  updateRequest,
} from "../src/repo";

let db: Database.Database;

beforeEach(() => {
  db = createDb(":memory:");
});

describe("requests", () => {
  it("creates a request with a unique edit token and lists it for its date", () => {
    const venue = createVenue(db, { name: "Mensa", mode: "dine_in", cutoffTime: "10:30", contact: null });
    const req = createRequest(db, {
      venueId: venue.id,
      date: "2026-07-24",
      personName: "Marco",
      mode: "dine_in",
      orderText: "Pasta al pomodoro",
    });

    expect(req.edit_token).toHaveLength(32);
    expect(listRequestsForDate(db, "2026-07-24")).toHaveLength(1);
    expect(listRequestsForDate(db, "2026-07-25")).toHaveLength(0);
  });

  it("only resolves a request when id and edit token both match", () => {
    const venue = createVenue(db, { name: "Mensa", mode: "dine_in", cutoffTime: "10:30", contact: null });
    const req = createRequest(db, {
      venueId: venue.id,
      date: "2026-07-24",
      personName: "Marco",
      mode: "dine_in",
      orderText: "Pasta",
    });

    expect(getRequestByToken(db, req.id, req.edit_token)).toBeDefined();
    expect(getRequestByToken(db, req.id, "wrong-token")).toBeUndefined();
  });

  it("update changes the order text and mode without touching identity", () => {
    const venue = createVenue(db, { name: "Poke", mode: "both", cutoffTime: "11:30", contact: null });
    const req = createRequest(db, {
      venueId: venue.id,
      date: "2026-07-24",
      personName: "Sara",
      mode: "dine_in",
      orderText: "Salmon bowl",
    });

    updateRequest(db, req.id, { mode: "takeaway", orderText: "Tuna bowl" });
    const updated = getRequestByToken(db, req.id, req.edit_token)!;
    expect(updated.mode).toBe("takeaway");
    expect(updated.order_text).toBe("Tuna bowl");
    expect(updated.person_name).toBe("Sara");
  });

  it("cancel excludes the request from that date's list", () => {
    const venue = createVenue(db, { name: "Mensa", mode: "dine_in", cutoffTime: "10:30", contact: null });
    const req = createRequest(db, {
      venueId: venue.id,
      date: "2026-07-24",
      personName: "Marco",
      mode: "dine_in",
      orderText: "Pasta",
    });

    cancelRequest(db, req.id);
    expect(listRequestsForDate(db, "2026-07-24")).toHaveLength(0);
  });
});

describe("sent marks", () => {
  it("is unset until markSent is called for that venue/date", () => {
    const venue = createVenue(db, { name: "Mensa", mode: "dine_in", cutoffTime: "10:30", contact: null });
    expect(isSent(db, venue.id, "2026-07-24")).toBe(false);
    markSent(db, venue.id, "2026-07-24");
    expect(isSent(db, venue.id, "2026-07-24")).toBe(true);
    expect(isSent(db, venue.id, "2026-07-25")).toBe(false);
  });

  it("unmarkSent reverts a venue/date back to not-sent", () => {
    const venue = createVenue(db, { name: "Mensa", mode: "dine_in", cutoffTime: "10:30", contact: null });
    markSent(db, venue.id, "2026-07-24");
    expect(isSent(db, venue.id, "2026-07-24")).toBe(true);
    unmarkSent(db, venue.id, "2026-07-24");
    expect(isSent(db, venue.id, "2026-07-24")).toBe(false);
  });
});
