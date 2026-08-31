// Scraper for public Telegram channels via t.me/s/{handle} web preview
// Only works for channels with web preview enabled (returns HTTP 200).
// Channels returning 302 have web preview disabled and cannot be scraped
// without the Telegram Bot API.

import * as cheerio from 'cheerio'
import type { RawEvent } from '@/types/event'

// Only channels confirmed to have web preview enabled (HTTP 200 on t.me/s/).
// To verify a new channel: curl -o /dev/null -w "%{http_code}" --max-redirs 0 https://t.me/s/{handle}
export const TELEGRAM_CHANNELS = [
  // Centri sociali
  { handle: 'cpafisud',                    label: 'CPA Firenze Sud' },
  { handle: 'Askatasuna_47',               label: 'Askatasuna / CSA Murazzi Torino' },
  { handle: 'LabasBo',                     label: 'Làbas Bologna' },
  { handle: 'csaintifadaempoli',           label: 'CS Antifada Empoli' },
  // Movimenti e media di movimento
  { handle: 'infocollettivodifabbricagkn', label: 'Collettivo di Fabbrica GKN' },
  { handle: 'radioondarossa',              label: 'Radio Onda Rossa' },
  { handle: 'dinamopress',                 label: 'DINAMOpress' },
  { handle: 'contropiano',                 label: 'Contropiano' },
  { handle: 'commonware',                  label: 'Commonware' },
  { handle: 'lottacomunista',              label: 'Lotta Comunista' },
  { handle: 'retedeicomunisti',            label: 'Rete dei Comunisti' },
  { handle: 'fronte_comunista',            label: 'Fronte Comunista' },
  // Partiti e organizzazioni politiche
  { handle: 'poterealpopolo',              label: 'Potere al Popolo' },
  { handle: 'sinistra_italiana',           label: 'Sinistra Italiana' },
  { handle: 'rifondazionefirenze',         label: 'Rifondazione Comunista Firenze' },
  // Sindacati di base
  { handle: 'usb_notizie',                 label: 'USB Notizie' },
  // Non Una Di Meno — sezioni locali
  { handle: 'nonunadimenofirenze',         label: 'Non Una Di Meno Firenze' },
  { handle: 'nonunadimenoroma',            label: 'Non Una Di Meno Roma' },
  { handle: 'nonunadimenonapoli',          label: 'Non Una Di Meno Napoli' },
  // Palestina
  { handle: 'giovanipalestinesi',          label: 'Giovani Palestinesi' },
  { handle: 'palestinaliber',              label: 'Palestina Libera' },
  // Campagne nazionali
  { handle: 'liberidilottarefermiamoddl1660', label: 'Liberi di Lottare – Fermiamo DDL 1660' },
  // Campagne internazionali con forte presenza italiana
  { handle: 'globalsumudflotilla',         label: 'Global Sumud Flotilla' },
]

// Keywords that indicate an event announcement (not generic political commentary)
const EVENT_KEYWORDS = [
  'manifestazione', 'corteo', 'presidio', 'sciopero', 'assemblea', 'sit-in',
  'picchetto', 'mobilitazione', 'concentramento', 'partenza', 'ritrovo',
  'sabato', 'domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì',
  'ore ', 'piazza', 'davanti a', 'usciremo', 'appuntamento', 'convocazione',
]

export async function scrapeTelegram(): Promise<RawEvent[]> {
  const events: RawEvent[] = []

  for (const channel of TELEGRAM_CHANNELS) {
    const channelEvents = await scrapeChannel(channel.handle, channel.label)
    events.push(...channelEvents)
    await new Promise((r) => setTimeout(r, 800))
  }

  return events
}

async function scrapeChannel(handle: string, label: string): Promise<RawEvent[]> {
  const url = `https://t.me/s/${handle}`
  const events: RawEvent[] = []

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ScioperoItaliaBot/1.0)',
        Accept: 'text/html',
      },
      redirect: 'manual', // catch redirects explicitly instead of throwing
      signal: AbortSignal.timeout(10_000),
    })

    if (res.status === 301 || res.status === 302) {
      console.warn(`[telegram] @${handle}: web preview disabled (${res.status}), skipping`)
      return events
    }

    if (!res.ok) {
      console.warn(`[telegram] @${handle}: HTTP ${res.status}, skipping`)
      return events
    }

    const html = await res.text()
    const $ = cheerio.load(html)

    // Each message is wrapped in div.tgme_widget_message_wrap
    $('.tgme_widget_message_wrap').each((_, el) => {
      const wrap = $(el)

      const textEl = wrap.find('.tgme_widget_message_text')
      if (!textEl.length) return

      // Get plain text, preserving line breaks
      textEl.find('br').replaceWith('\n')
      const text = textEl.text().replace(/\s+/g, ' ').trim()

      if (text.length < 30) return

      const textLower = text.toLowerCase()
      const isEvent = EVENT_KEYWORDS.some((kw) => textLower.includes(kw))
      if (!isEvent) return

      const dateEl = wrap.find('a.tgme_widget_message_date time')
      const datetime = dateEl.attr('datetime') ?? ''
      const postUrl = wrap.find('a.tgme_widget_message_date').attr('href') ?? `https://t.me/${handle}`

      events.push({
        title: text.slice(0, 120).split('\n')[0].trim(),
        raw_text: [
          datetime ? `Data messaggio: ${datetime}` : '',
          `Canale: @${handle} (${label})`,
          text,
        ].filter(Boolean).join('\n'),
        source_url: postUrl,
        source_name: 'telegram',
      })
    })
  } catch (err: unknown) {
    console.error(`[telegram] @${handle}: fetch error:`, err)
  }

  console.log(`[telegram] @${handle}: ${events.length} eventi trovati`)

  return events
}
