import { describe, expect, it } from "vitest";
import {
  cutoffInstant,
  isDateSelectable,
  isPastCutoff,
  isValidCutoffTime,
  today,
  MAX_DAYS_AHEAD,
} from "../src/services/cutoff";

const venue = { cutoff_time: "10:30" };

describe("cutoffInstant", () => {
  it("builds the exact server-local instant from date + cutoff_time", () => {
    const instant = cutoffInstant(venue, "2026-07-24");
    expect(instant.getFullYear()).toBe(2026);
    expect(instant.getMonth()).toBe(6); // 0-indexed: July
    expect(instant.getDate()).toBe(24);
    expect(instant.getHours()).toBe(10);
    expect(instant.getMinutes()).toBe(30);
  });

  it("rejects a malformed date", () => {
    expect(() => cutoffInstant(venue, "24-07-2026")).toThrow();
  });

  it("rejects a malformed cutoff time", () => {
    expect(() => cutoffInstant({ cutoff_time: "10:30:00" }, "2026-07-24")).toThrow();
  });
});

describe("isPastCutoff", () => {
  it("is false one minute before the cutoff", () => {
    const now = new Date(2026, 6, 24, 10, 29);
    expect(isPastCutoff(venue, "2026-07-24", now)).toBe(false);
  });

  it("is true exactly at the cutoff — 'by 10:30' means 10:30 no longer works", () => {
    const now = new Date(2026, 6, 24, 10, 30);
    expect(isPastCutoff(venue, "2026-07-24", now)).toBe(true);
  });

  it("is true well after the cutoff", () => {
    const now = new Date(2026, 6, 24, 14, 0);
    expect(isPastCutoff(venue, "2026-07-24", now)).toBe(true);
  });

  it("a future date's cutoff has not passed yet, even late today", () => {
    const now = new Date(2026, 6, 24, 23, 0);
    expect(isPastCutoff(venue, "2026-07-25", now)).toBe(false);
  });
});

describe("isDateSelectable", () => {
  const now = new Date(2026, 6, 24, 9, 0);

  it("allows today", () => {
    expect(isDateSelectable(today(now), now)).toBe(true);
  });

  it("rejects a date in the past", () => {
    expect(isDateSelectable("2026-07-23", now)).toBe(false);
  });

  it("allows a date within the planning horizon", () => {
    expect(isDateSelectable("2026-08-01", now)).toBe(true); // 8 days ahead
  });

  it("rejects a date beyond the planning horizon", () => {
    expect(isDateSelectable("2026-09-01", now)).toBe(false);
  });

  it("allows exactly MAX_DAYS_AHEAD days ahead", () => {
    const d = new Date(now);
    d.setDate(d.getDate() + MAX_DAYS_AHEAD);
    expect(isDateSelectable(today(d), now)).toBe(true);
  });

  it("rejects a garbage date string", () => {
    expect(isDateSelectable("not-a-date", now)).toBe(false);
  });
});

describe("isValidCutoffTime", () => {
  it("accepts well-formed HH:MM times", () => {
    expect(isValidCutoffTime("00:00")).toBe(true);
    expect(isValidCutoffTime("10:30")).toBe(true);
    expect(isValidCutoffTime("23:59")).toBe(true);
  });

  it("rejects out-of-range hours or minutes — the input a looser regex would let through", () => {
    expect(isValidCutoffTime("99:99")).toBe(false);
    expect(isValidCutoffTime("24:00")).toBe(false);
    expect(isValidCutoffTime("10:60")).toBe(false);
  });

  it("rejects malformed strings", () => {
    expect(isValidCutoffTime("10:30:00")).toBe(false);
    expect(isValidCutoffTime("10-30")).toBe(false);
    expect(isValidCutoffTime("")).toBe(false);
  });
});
