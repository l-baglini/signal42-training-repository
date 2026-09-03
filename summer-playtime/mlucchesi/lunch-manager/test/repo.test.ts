import { beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { createDb } from "../src/db";
import {
  addMenuItem,
  cancelRequest,
  createRequest,
  createVenue,
  getRequestByToken,
  isActiveMenuItemName,
  isSent,
  listActiveMenuItems,
  listRequestsForDate,
  markSent,
  unmarkSent,
  updateRequest,
} from "../src/repo";

let db: Database.Database;

beforeEach(() => {
  db = createDb(":memory:");
});

describe("menu items", () => {
  it("lists only active items for the venue they belong to", () => {
    const venue = createVenue(db, { name: "Mensa", mode: "dine_in", cutoffTime: "10:30", contact: null });
    const other = createVenue(db, { name: "Poke", mode: "takeaway", cutoffTime: "11:30", contact: null });
    addMenuItem(db, venue.id, "Pasta al pomodoro");
    addMenuItem(db, venue.id, "Riso e verdure");
    addMenuItem(db, other.id, "Salmon bowl");

    const items = listActiveMenuItems(db, venue.id);
    expect(items.map((i) => i.name)).toEqual(["Pasta al pomodoro", "Riso e verdure"]);
  });

  it("adding the same dish name twice for a venue does not create a duplicate", () => {
    const venue = createVenue(db, { name: "Mensa", mode: "dine_in", cutoffTime: "10:30", contact: null });
    const first = addMenuItem(db, venue.id, "Pasta al pomodoro");
    const second = addMenuItem(db, venue.id, "Pasta al pomodoro");

    expect(second.id).toBe(first.id);
    expect(listActiveMenuItems(db, venue.id)).toHaveLength(1);
  });

  it("the same dish name is still allowed across different venues", () => {
    const venue = createVenue(db, { name: "Mensa", mode: "dine_in", cutoffTime: "10:30", contact: null });
    const other = createVenue(db, { name: "Poke", mode: "takeaway", cutoffTime: "11:30", contact: null });
    addMenuItem(db, venue.id, "Insalata");
    addMenuItem(db, other.id, "Insalata");

    expect(listActiveMenuItems(db, venue.id)).toHaveLength(1);
    expect(listActiveMenuItems(db, other.id)).toHaveLength(1);
  });

  it("isActiveMenuItemName only matches an existing item for that venue", () => {
    const venue = createVenue(db, { name: "Mensa", mode: "dine_in", cutoffTime: "10:30", contact: null });
    const other = createVenue(db, { name: "Poke", mode: "takeaway", cutoffTime: "11:30", contact: null });
    addMenuItem(db, venue.id, "Pasta al pomodoro");

    expect(isActiveMenuItemName(db, venue.id, "Pasta al pomodoro")).toBe(true);
    expect(isActiveMenuItemName(db, venue.id, "Piatto inventato")).toBe(false);
    expect(isActiveMenuItemName(db, other.id, "Pasta al pomodoro")).toBe(false);
  });
});

describe("requests", () => {
  it("creates a request with a unique edit token and lists it for its date", () => {
    const venue = createVenue(db, { name: "Mensa", mode: "dine_in", cutoffTime: "10:30", contact: null });
    const req = createRequest(db, {
      venueId: venue.id,
      date: "2026-07-24",
      personName: "Marco",
      mode: "dine_in",
      dish: "Pasta al pomodoro",
      note: null,
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
      dish: "Pasta",
      note: null,
    });

    expect(getRequestByToken(db, req.id, req.edit_token)).toBeDefined();
    expect(getRequestByToken(db, req.id, "wrong-token")).toBeUndefined();
  });

  it("update changes the dish, note and mode without touching identity", () => {
    const venue = createVenue(db, { name: "Poke", mode: "both", cutoffTime: "11:30", contact: null });
    const req = createRequest(db, {
      venueId: venue.id,
      date: "2026-07-24",
      personName: "Sara",
      mode: "dine_in",
      dish: "Salmon bowl",
      note: null,
    });

    updateRequest(db, req.id, { mode: "takeaway", dish: "Tuna bowl", note: "senza cipolla" });
    const updated = getRequestByToken(db, req.id, req.edit_token)!;
    expect(updated.mode).toBe("takeaway");
    expect(updated.dish).toBe("Tuna bowl");
    expect(updated.note).toBe("senza cipolla");
    expect(updated.person_name).toBe("Sara");
  });

  it("cancel excludes the request from that date's list", () => {
    const venue = createVenue(db, { name: "Mensa", mode: "dine_in", cutoffTime: "10:30", contact: null });
    const req = createRequest(db, {
      venueId: venue.id,
      date: "2026-07-24",
      personName: "Marco",
      mode: "dine_in",
      dish: "Pasta",
      note: null,
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
