import Anthropic from '@anthropic-ai/sdk'
import type { ExtractedEvent, RawEvent } from '@/types/event'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const MAX_RAW_TEXT = 900

// Tool schema for structured event extraction
const EXTRACT_TOOL: Anthropic.Tool = {
  name: 'save_event',
  description: 'Salva le informazioni estratte da un testo relativo a uno sciopero o manifestazione italiana.',
  input_schema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'Titolo breve e descrittivo dell\'evento (max 120 caratteri)',
      },
      description: {
        type: 'string',
        description: 'Descrizione dell\'evento in 2-4 frasi',
      },
      event_type: {
        type: 'string',
        enum: ['sciopero', 'manifestazione', 'corteo', 'presidio', 'altro'],
        description: 'Tipo principale dell\'evento',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Tag tematici multipli (es: lavoro, palestina, ambiente, trasporti, sanità, istruzione, no-guerra, femminismo, antifascismo)',
      },
      location_text: {
        type: 'string',
        description: 'Luogo esatto come scritto nel testo (es: "Piazza del Duomo, Milano")',
      },
      city: {
        type: 'string',
        description: 'Nome della città',
      },
      region: {
        type: 'string',
        description: 'Regione italiana (es: Lombardia, Lazio, Toscana)',
      },
      start_date: {
        type: 'string',
        description: 'Data/ora inizio in formato ISO 8601 (YYYY-MM-DDTHH:MM:SS). Null se non specificata.',
        nullable: true,
      },
      end_date: {
        type: 'string',
        description: 'Data/ora fine in formato ISO 8601. Null se non specificata.',
        nullable: true,
      },
    },
    required: ['title', 'description', 'event_type', 'tags', 'location_text', 'city', 'region'],
  },
  cache_control: { type: 'ephemeral' },
}

// System prompt — cached by Anthropic after first call (ephemeral cache)
const SYSTEM_PROMPT = `Sei un assistente specializzato nell'estrazione strutturata di informazioni da testi italiani relativi a scioperi, manifestazioni, cortei e presidi.

Il tuo compito è analizzare il testo fornito e chiamare lo strumento save_event per ogni evento trovato.

Regole:
- Se il testo contiene più eventi distinti (es. un digest o una lista di appuntamenti), chiama save_event una volta per ciascun evento
- Se il testo descrive un solo evento, chiama save_event una volta sola
- Estrai SEMPRE tutte le informazioni disponibili nel testo
- I tag devono essere in italiano minuscolo, senza spazi (usa il trattino se necessario): lavoro, ambiente, palestina, no-guerra, trasporti, sanità, istruzione, femminismo, antifascismo, scuola, pensioni, precariato, diritti-lgbtq, migranti, casa, energia
- Una manifestazione può avere più tag contemporaneamente (es: uno sciopero GKN può avere: lavoro, ambiente, solidarietà)
- Se la data non è specificata o non è comprensibile, usa null
- Per le date, assume l'anno corrente se non indicato
- Estrai la regione dal nome della città/provincia se non esplicitamente menzionata`

// Returns all events extracted from a single raw message (may be >1 for digest posts)
export async function extractEvent(raw: RawEvent): Promise<ExtractedEvent[]> {
  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 2048,
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        {
          role: 'user',
          content: `Fonte: ${raw.source_name} (${raw.source_url})\n\nTesto:\n${raw.raw_text.slice(0, MAX_RAW_TEXT)}`,
        },
      ],
      tools: [EXTRACT_TOOL],
      tool_choice: { type: 'any' },
    })

    const events = response.content
      .filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
      .map(b => b.input as ExtractedEvent)

    if (!events.length) {
      console.error('[claude] no tool_use in response, stop_reason:', response.stop_reason)
    }

    return events
  } catch (err) {
    console.error('[claude] extraction failed:', err)
    return []
  }
}

// Batch extraction — 5 concurrent requests, 6s between batches
// Tier 1 limit: 50 RPM. 5 req / 8s total per batch ≈ 37.5 RPM — safely under limit.
export async function extractBatch(
  raws: RawEvent[],
  onProgress?: (done: number, total: number) => void
): Promise<Array<{ raw: RawEvent; events: ExtractedEvent[] }>> {
  const CONCURRENCY = 5
  const BATCH_DELAY_MS = 6_000
  const results: Array<{ raw: RawEvent; events: ExtractedEvent[] }> = []
  let done = 0

  for (let i = 0; i < raws.length; i += CONCURRENCY) {
    if (i > 0) await new Promise((r) => setTimeout(r, BATCH_DELAY_MS))
    const chunk = raws.slice(i, i + CONCURRENCY)
    const chunkResults = await Promise.all(chunk.map(r => extractEvent(r)))
    for (let j = 0; j < chunkResults.length; j++) {
      results.push({ raw: chunk[j], events: chunkResults[j] })
    }
    done += chunk.length
    onProgress?.(done, raws.length)
  }

  return results
}
