import Anthropic from "@anthropic-ai/sdk";
import type { RequestMode } from "../types";

export interface OrderLine {
  personName: string;
  mode: RequestMode;
  orderText: string;
}

export interface DraftInput {
  venueName: string;
  date: string;
  lines: OrderLine[];
}

export interface DraftResult {
  text: string;
  source: "ai" | "fallback";
}

const MODE_LABEL: Record<RequestMode, string> = {
  dine_in: "sul posto",
  takeaway: "asporto",
};

/** Deterministic, no-dependency message — the guardrail when AI isn't available. */
export function buildFallbackMessage(input: DraftInput): string {
  const header = `Ordine pranzo per ${input.venueName} — ${input.date} (${input.lines.length} persone)`;
  const lines = input.lines.map(
    (l) => `- ${l.personName} (${MODE_LABEL[l.mode]}): ${l.orderText}`,
  );
  return [header, "", ...lines].join("\n");
}

/**
 * Drafts a ready-to-send message for the venue. Falls back to the
 * deterministic template whenever AI isn't configured or fails — generation
 * must never block the office manager on the model being up.
 */
export async function draftMessage(input: DraftInput): Promise<DraftResult> {
  if (input.lines.length === 0) {
    return { text: buildFallbackMessage(input), source: "fallback" };
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return { text: buildFallbackMessage(input), source: "fallback" };
  }

  try {
    const client = new Anthropic();
    const model = process.env.ANTHROPIC_MODEL || "claude-opus-5";
    const orderList = input.lines
      .map((l) => `- ${l.personName} (${MODE_LABEL[l.mode]}): ${l.orderText}`)
      .join("\n");

    const response = await client.messages.create({
      model,
      max_tokens: 500,
      output_config: { effort: "low" },
      system:
        "Scrivi in italiano un messaggio breve, chiaro e pronto da inviare " +
        "(es. su WhatsApp) al gestore di un ristorante/mensa per comunicare " +
        "l'ordine pranzo di un ufficio. Includi il nome del locale, la data, " +
        "il totale delle persone e l'elenco nome + modalità (sul posto/asporto) " +
        "+ ordine. Nessun preambolo, nessuna nota finale: solo il messaggio.",
      messages: [
        {
          role: "user",
          content: `Locale: ${input.venueName}\nData: ${input.date}\nOrdini:\n${orderList}`,
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || !("text" in textBlock) || !textBlock.text.trim()) {
      return { text: buildFallbackMessage(input), source: "fallback" };
    }
    return { text: textBlock.text.trim(), source: "ai" };
  } catch (err) {
    console.error("AI message draft failed, using fallback template:", err);
    return { text: buildFallbackMessage(input), source: "fallback" };
  }
}
