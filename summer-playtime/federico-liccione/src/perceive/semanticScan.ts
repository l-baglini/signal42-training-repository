/**
 * One vision call per room. SPEC §7.3 and §7.6.
 *
 * The model is handed the frame with the depth pass's regions drawn and numbered
 * on it, and asked only to name and classify them. It is never asked where
 * anything is — geometry is what the engine's guarantees rest on, and a language
 * model is worst at exactly that.
 *
 * Every identifier here was verified against the API reference during
 * specification rather than written from memory. In particular: structured output
 * goes through `output_config.format`, not tool use and not assistant prefill,
 * which returns 400 on current models; the image block comes *before* the text
 * block; and `source.data` is raw base64 with no `data:` prefix.
 */
import { validateInventory, costOf, type Inventory, type InventoryCost } from './inventory'
import type { Component } from './roomGeometry'

const ENDPOINT = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-sonnet-5'

/**
 * Per-MTok pricing for the model above, for the cost panel. If the model changes
 * this must change with it — a cost display that is quietly wrong is worse than
 * no cost display, and the brief asks for a *visible* cost.
 */
const PRICE = { input: 2, output: 10 } as const

/** No numeric bounds and no recursion in this schema language; every object needs
 * additionalProperties:false. Range checking happens in `validateInventory`. */
const SCHEMA = {
  type: 'object',
  properties: {
    regions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          index: { type: 'integer' },
          label: { type: 'string' },
          class: {
            type: 'string',
            enum: ['furniture', 'appliance', 'decor', 'structure', 'window', 'person', 'other'],
          },
          use: { type: 'string', enum: ['cover', 'hazard', 'ignore'] },
        },
        required: ['index', 'label', 'class', 'use'],
        additionalProperties: false,
      },
    },
  },
  required: ['regions'],
  additionalProperties: false,
} as const

const PROMPT = `This is a photo of a room, taken by a webcam facing the person sitting at the screen.
Numbered boxes mark surfaces that a depth pass already found. For each number, say what the object is.

For "use", judge it as cover in a game where the player leans sideways to peek around things:
- "cover" — a solid object a person could hide behind, such as furniture, a monitor, a shelf.
- "hazard" — somewhere nothing should be placed: a bright window or lamp, a mirror, a screen.
  Anything that is blown out or strongly backlit belongs here.
- "ignore" — flat wall, floor, ceiling, or anything too thin or too vague to hide behind.

Reply for every number you can see. Omit a number rather than guessing about it.`

export interface SemanticScanInput {
  readonly apiKey: string
  readonly canvas: HTMLCanvasElement
  readonly regions: readonly Component[]
  readonly frameWidth: number
  readonly frameHeight: number
}

export type SemanticResult =
  | { readonly ok: true; readonly inventory: Inventory; readonly cost: InventoryCost
      readonly dropped: number; readonly typeErrors: number; readonly ms: number }
  | { readonly ok: false; readonly reason: string }

/**
 * Draw the numbered regions onto a copy of the frame. The numbers are what make
 * the model's answer addressable, and drawing them is what makes asking for an
 * index reliable instead of hopeful.
 */
export function annotate(
  source: HTMLCanvasElement,
  regions: readonly Component[],
): HTMLCanvasElement {
  const out = document.createElement('canvas')
  out.width = source.width
  out.height = source.height
  const ctx = out.getContext('2d')
  if (!ctx) return out
  ctx.drawImage(source, 0, 0)
  ctx.lineWidth = Math.max(2, Math.round(source.width / 200))
  ctx.font = `bold ${Math.max(14, Math.round(source.width / 16))}px sans-serif`
  ctx.textBaseline = 'top'
  regions.forEach((r, i) => {
    ctx.strokeStyle = '#ff3b6b'
    ctx.strokeRect(r.u0, r.v0, r.u1 - r.u0, r.v1 - r.v0)
    const text = String(i)
    const w = ctx.measureText(text).width
    ctx.fillStyle = '#ff3b6b'
    ctx.fillRect(r.u0, r.v0, w + 10, Math.max(18, Math.round(source.width / 14)))
    ctx.fillStyle = '#fff'
    ctx.fillText(text, r.u0 + 5, r.v0 + 2)
  })
  return out
}

export async function semanticScan(input: SemanticScanInput): Promise<SemanticResult> {
  if (!input.apiKey.trim()) return { ok: false, reason: 'no API key given' }
  if (input.regions.length === 0) return { ok: false, reason: 'no regions to name' }

  const annotated = annotate(input.canvas, input.regions)
  // Raw base64 only: the data: prefix that toDataURL produces is not accepted.
  const dataUrl = annotated.toDataURL('image/jpeg', 0.86)
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)

  const body = {
    model: MODEL,
    max_tokens: 2048,
    messages: [
      {
        role: 'user',
        content: [
          // Image first: the documented ordering, and it matters.
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } },
          { type: 'text', text: `${PROMPT}\n\nThere are ${input.regions.length} numbered regions, 0 to ${input.regions.length - 1}.` },
        ],
      },
    ],
    output_config: { format: { type: 'json_schema', schema: SCHEMA } },
  }

  const t0 = performance.now()
  let res: Response
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': input.apiKey.trim(),
        'anthropic-version': '2023-06-01',
        // Required for a browser request, and its name is the warning. The key
        // lives in page memory only: never stored, never logged, never sent
        // anywhere else. SPEC §7.6.
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body),
    })
  } catch (err) {
    return { ok: false, reason: `network: ${err instanceof Error ? err.message : String(err)}` }
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    return { ok: false, reason: `HTTP ${res.status}: ${text.slice(0, 200)}` }
  }

  const payload = (await res.json().catch(() => null)) as {
    stop_reason?: string
    usage?: { input_tokens?: number; output_tokens?: number }
    content?: Array<{ type: string; text?: string }>
  } | null
  if (!payload) return { ok: false, reason: 'the response was not JSON' }

  // A truncated response is unparseable and a refusal is not schema-valid.
  // Both are checked before any JSON.parse rather than after it throws.
  if (payload.stop_reason === 'max_tokens') {
    return { ok: false, reason: 'the reply was cut off by max_tokens' }
  }
  if (payload.stop_reason === 'refusal') {
    return { ok: false, reason: 'the model declined to answer' }
  }

  const text = payload.content?.find((b) => b.type === 'text')?.text
  if (!text) return { ok: false, reason: 'the response carried no text block' }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, reason: 'the reply was not valid JSON despite the schema' }
  }

  const { inventory, dropped, typeErrors } = validateInventory(parsed, input.regions.length)
  return {
    ok: true,
    inventory,
    dropped,
    typeErrors,
    ms: performance.now() - t0,
    cost: costOf(
      MODEL,
      payload.usage?.input_tokens ?? 0,
      payload.usage?.output_tokens ?? 0,
      PRICE,
    ),
  }
}
