/**
 * A level from a sentence — the call.
 *
 * The prompt below is part of the craft rather than an afterthought. The model is
 * *taught* the coordinate frame and the one geometric constraint that decides
 * whether a layout can be played at all, because leaving it to infer that from
 * nothing would be asking it to rediscover the leverage identity by guesswork.
 * What it is not told is where enemies go: it lays out walls, and the engine
 * decides what can be fought from where.
 */
import { MOOD_HINTS } from '../render/mood'
import { costOf, type InventoryCost } from './inventory'
import { COVER_BAND, EXTENT, MAX_COVER, levelFromRects, type DesignReport } from './levelDesign'

const ENDPOINT = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-sonnet-5'
const PRICE = { input: 2, output: 10 } as const

/**
 * Sized for a model that thinks whether or not you asked it to.
 *
 * 2048 came back truncated for a reply whose JSON is a few hundred tokens, and
 * the cause is documented rather than mysterious: `claude-sonnet-5` runs
 * **adaptive thinking by default** when `thinking` is omitted, at `effort: high`,
 * and those tokens count against `max_tokens` — and are billed — even though the
 * default display setting returns them empty. So the budget has to cover
 * everything spent before the JSON, not just the JSON.
 *
 * The documented remedy is two-part, and the effort setting is the one that
 * matters: `max_tokens` is a cap rather than a reservation, so raising it costs
 * nothing unused, but a larger ceiling also gives adaptive thinking more room to
 * spend. 16000 is the reference's non-streaming default; above 21,333 the SDK
 * requires streaming, which is why the retry stops at 20000.
 */
const MAX_TOKENS = 16000
const MAX_TOKENS_RETRY = 20000

const SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    blurb: { type: 'string' },
    cover: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          z: { type: 'number' },
          x0: { type: 'number' },
          x1: { type: 'number' },
          y0: { type: 'number' },
          y1: { type: 'number' },
        },
        required: ['label', 'z', 'x0', 'x1', 'y0', 'y1'],
        additionalProperties: false,
      },
    },
  },
  required: ['name', 'blurb', 'cover'],
  additionalProperties: false,
} as const

const SYSTEM = `You lay out levels for a cover shooter played by leaning your head.

THE WORLD. Centimetres. The screen is the plane z = 0; the player's eye sits at
about z = +60 and can lean roughly 20 cm left or right, 11 cm up or down. The
level lives at z < 0, beyond the screen. x is right, y is up, both measured from
the centre of the screen.

WHAT YOU PLACE. Only cover: axis-aligned rectangles parallel to the screen. Give
between 2 and ${MAX_COVER} of them. You do NOT place enemies — enemies go behind
the cover you place, and the game works out for itself which positions are fair.

THE ONE RULE THAT MATTERS. Cover must sit between z = ${COVER_BAND.nearest} and
z = ${COVER_BAND.furthest}. This is not a preference. A player's influence over
where their line of sight crosses an obstacle falls off with the obstacle's
distance, so cover further away than about a metre cannot be leaned around by any
human at all, and a level built from it is unplayable.

WHAT IS IN FRAME. This matters more than it sounds. The player looks through a
window about 34 cm wide from 60 cm away, so the visible cone is narrow where cover
lives: at z = ${COVER_BAND.nearest} it spans about x -26 to 26 and y -16 to 16, and
at z = ${COVER_BAND.furthest} about x -44 to 44 and y -27 to 27. Cover placed
outside that is off the edge of the screen and the player never sees it. Stay
inside x -${EXTENT.x} to ${EXTENT.x} and y -${EXTENT.y} to ${EXTENT.y}, and treat
the middle of that as the useful area.

WHERE EYE LEVEL IS. y = 0 is the player's eye. A rectangle that does not cross
y = 0 cannot block a horizontal line of sight, so it is not cover in the ordinary
sense: it is a *low wall*, which works only if the player is meant to rise up over
it, and asking somebody to lift their head is a smaller movement than asking them
to lean sideways. Most of your rectangles should straddle y = 0. One low wall in a
layout is a good idea; a layout of only low walls has no cover in it at all.

WHAT MAKES A GOOD LAYOUT.
- Leave gaps. A player who cannot see anything from anywhere has no level, and
  cover that spans the whole view is a blindfold.
- Vary the axis. A tall narrow upright makes the player lean sideways; a wide low
  wall makes them rise up over it. A level of only uprights is a level of only
  one movement, and a neck has about half the vertical range it has lateral, so
  vertical peeks are rarer and more valuable.
- Vary the depth. Cover nearer the screen gives the player more leverage, so it
  makes the easier positions; cover near the far end of the band makes the harder
  ones.
- Overlap deliberately. Two rectangles that between them wall off one side create
  a genuinely hard corner, but check you have not walled off every side.

THE SETTING IS YOURS TO NAME, AND IT IS NOT DECORATION. The game picks its
palette, its weather and its lighting by reading the words in the name and blurb
you write — nothing else selects them, and there is no separate field. So if the
player asked for a forest, or neon, or rain, say so in those words. The settings
that exist are: ${MOOD_HINTS.join('; ')}. Anything else falls back to a clear
afternoon, which is a fine answer when the player did not ask for one. Write the
setting into the blurb even when the player named it themselves, because the blurb
is what the game reads.

Answer with the geometry only, plus that name and blurb. Both are shown to the
player, and the blurb also chooses how the level looks.`

export type LevelDesignResult =
  | { readonly ok: true; readonly report: DesignReport; readonly name: string
      readonly blurb: string; readonly cost: InventoryCost; readonly ms: number }
  | { readonly ok: false; readonly reason: string }

interface Payload {
  stop_reason?: string
  usage?: { input_tokens?: number; output_tokens?: number }
  content?: Array<{ type: string; text?: string }>
}

type Attempt = { ok: true; payload: Payload } | { ok: false; reason: string }

async function attempt(
  apiKey: string,
  description: string,
  maxTokens: number,
): Promise<Attempt> {
  let res: Response
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey.trim(),
        'anthropic-version': '2023-06-01',
        // Required for a browser request, and its name is the warning. The key
        // lives in page memory only. SPEC §7.6.
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: maxTokens,
        system: SYSTEM,
        messages: [{ role: 'user', content: description.trim().slice(0, 600) }],
        output_config: {
          format: { type: 'json_schema', schema: SCHEMA },
          // Thinking stays on — the reference prefers lowering effort to
          // disabling it — but at the lowest level, because naming rectangles
          // and laying out walls are not tasks that reward deliberation.
          effort: 'low',
        },
      }),
    })
  } catch (err) {
    return { ok: false, reason: `network: ${err instanceof Error ? err.message : String(err)}` }
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    return { ok: false, reason: `HTTP ${res.status}: ${text.slice(0, 200)}` }
  }
  const payload = (await res.json().catch(() => null)) as Payload | null
  if (!payload) return { ok: false, reason: 'the response was not JSON' }
  return { ok: true, payload }
}

export async function askForLevel(
  apiKey: string,
  description: string,
): Promise<LevelDesignResult> {
  if (!apiKey.trim()) return { ok: false, reason: 'no API key given' }
  if (!description.trim()) return { ok: false, reason: 'describe a level first' }

  const t0 = performance.now()
  let got = await attempt(apiKey, description, MAX_TOKENS)

  /**
   * One retry with a larger ceiling. A truncated structured reply is unparseable
   * rather than merely short, and the ceiling has to cover whatever the model
   * spends before the JSON — not just the JSON. Retried once and no further: if
   * twice this budget is not enough the problem is not the budget.
   */
  if (got.ok && got.payload.stop_reason === 'max_tokens') {
    got = await attempt(apiKey, description, MAX_TOKENS_RETRY)
  }
  if (!got.ok) return { ok: false, reason: got.reason }

  const payload = got.payload
  if (payload.stop_reason === 'max_tokens') {
    return {
      ok: false,
      reason: `the reply was still cut off at ${MAX_TOKENS_RETRY} tokens`,
    }
  }
  if (payload.stop_reason === 'refusal') return { ok: false, reason: 'the model declined' }

  // The first text block: a thinking block, if the model emits one, comes before
  // it and is not the structured output.
  const text = payload.content?.find((b) => b.type === 'text')?.text
  if (!text) return { ok: false, reason: 'the response carried no text block' }

  let parsed: { name?: unknown; blurb?: unknown; cover?: unknown }
  try {
    parsed = JSON.parse(text) as typeof parsed
  } catch {
    return { ok: false, reason: 'the reply was not valid JSON despite the schema' }
  }

  const name = typeof parsed.name === 'string' && parsed.name.trim()
    ? parsed.name.trim().slice(0, 40)
    : 'Untitled'
  const blurb = typeof parsed.blurb === 'string' ? parsed.blurb.trim().slice(0, 220) : ''
  const cover = Array.isArray(parsed.cover) ? parsed.cover : []

  const report = levelFromRects(cover, name, MODEL, new Date().toISOString())
  if (report.kept === 0) {
    return { ok: false, reason: `nothing usable came back: ${report.dropped} rectangles dropped` }
  }

  return {
    ok: true,
    report,
    name,
    blurb,
    ms: performance.now() - t0,
    cost: costOf(
      MODEL,
      payload.usage?.input_tokens ?? 0,
      payload.usage?.output_tokens ?? 0,
      PRICE,
    ),
  }
}
