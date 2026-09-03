import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildFallbackMessage, draftMessage } from "../src/services/messageDraft";

const input = {
  venueName: "Trattoria Da Gino",
  date: "2026-07-24",
  lines: [
    { personName: "Marco", mode: "dine_in" as const, dish: "Margherita", note: "senza cipolla" },
    { personName: "Sara", mode: "takeaway" as const, dish: "Cotoletta", note: null },
  ],
};

describe("buildFallbackMessage", () => {
  it("is deterministic and includes every order line, with the note in parentheses", () => {
    const msg = buildFallbackMessage(input);
    expect(msg).toContain("Trattoria Da Gino");
    expect(msg).toContain("2026-07-24");
    expect(msg).toContain("Marco");
    expect(msg).toContain("Margherita (senza cipolla)");
    expect(msg).toContain("Sara");
    expect(msg).toContain("Cotoletta");
    expect(buildFallbackMessage(input)).toBe(msg);
  });

  it("omits the parentheses entirely when there is no note", () => {
    const msg = buildFallbackMessage(input);
    expect(msg).toContain("Sara (asporto): Cotoletta");
    expect(msg).not.toContain("Cotoletta (");
  });
});

describe("draftMessage", () => {
  const originalKey = process.env.ANTHROPIC_API_KEY;

  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  it("falls back to the deterministic template when no API key is configured", async () => {
    const result = await draftMessage(input);
    expect(result.source).toBe("fallback");
    expect(result.text).toBe(buildFallbackMessage(input));
  });

  it("falls back for an empty order list without needing an API key", async () => {
    const empty = { ...input, lines: [] };
    const result = await draftMessage(empty);
    expect(result.source).toBe("fallback");
    expect(result.text).toBe(buildFallbackMessage(empty));
  });

  afterAll(() => {
    if (originalKey) process.env.ANTHROPIC_API_KEY = originalKey;
  });
});
