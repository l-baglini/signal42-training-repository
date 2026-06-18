// Scraper for Italian centri sociali that publish via WordPress/noblogs.org RSS feeds
// Only posts containing event keywords are forwarded to Claude extraction

import * as cheerio from 'cheerio'
import type { RawEvent } from '@/types/event'

const FEEDS = [
  // Centri sociali — noblogs.org
  { url: 'https://cox18.noblogs.org/feed/',          label: 'C.S.O.A. COX18 Milano' },
  { url: 'https://gabrio.noblogs.org/feed/',         label: 'C.S.O.A. Gabrio Torino' },
  { url: 'https://cittamigrante.noblogs.org/feed/',  label: 'Città Migrante Reggio Emilia' },
  { url: 'https://lanemesi.noblogs.org/feed/',       label: 'La Nemesi Genova' },
  // Movimenti — WordPress
  { url: 'https://nonunadimeno.wordpress.com/feed/', label: 'Non Una Di Meno' },
  // Media di movimento
  { url: 'https://infoaut.org/feed/',                label: 'Infoaut' },
  { url: 'https://www.pressenza.com/it/feed/',       label: 'Pressenza Italia' },
  // Partiti e organizzazioni
  { url: 'https://poterealpopolo.org/feed/',         label: 'Potere al Popolo' },
  { url: 'https://www.sinistraitaliana.it/feed/',    label: 'Sinistra Italiana' },
  // Stampa di movimento
  { url: 'https://cms.ilmanifesto.it/feed',          label: 'Il Manifesto' },
  { url: 'https://www.osservatoriorepressione.info/feed/', label: 'Osservatorio Repressione' },
  { url: 'https://www.meltingpot.org/feed/',         label: 'Melting Pot' },
  { url: 'https://www.popoffquotidiano.it/feed/',    label: 'Popoff Quotidiano' },
  // Sindacati di base
  { url: 'https://www.sicobas.org/feed/',            label: 'SI Cobas' },
  { url: 'https://adlcobas.it/feed/',                label: 'ADL Cobas' },
  { url: 'https://www.cub.it/feed/',                 label: 'CUB' },
  // Movimenti
  { url: 'https://notav.info/feed/',                 label: 'No TAV' },
  { url: 'https://fridaysforfutureitalia.it/feed/',  label: 'Fridays For Future Italia' },
]

const EVENT_KEYWORDS = [
  'manifestazione', 'corteo', 'presidio', 'sciopero', 'assemblea', 'sit-in',
  'picchetto', 'mobilitazione', 'concentramento', 'partenza', 'ritrovo',
  'iniziative della settimana', 'sabato', 'domenica', 'ore ', 'piazza',
  'davanti a', 'appuntamento', 'convocazione',
]

export async function scrapeCentriSociali(): Promise<RawEvent[]> {
  const events: RawEvent[] = []

  for (const feed of FEEDS) {
    const feedEvents = await scrapeFeed(feed.url, feed.label)
    events.push(...feedEvents)
    await new Promise((r) => setTimeout(r, 800))
  }

  return events
}

async function scrapeFeed(url: string, label: string): Promise<RawEvent[]> {
  const events: RawEvent[] = []

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ScioperoItaliaBot/1.0)',
        Accept: 'application/rss+xml, application/xml, text/xml',
      },
      signal: AbortSignal.timeout(10_000),
    })

    if (!res.ok) return events

    const xml = await res.text()
    const $ = cheerio.load(xml, { xmlMode: true })

    $('item').each((_, el) => {
      const item = $(el)
      const title = item.find('title').text().trim()
      const rawDesc = item.find('description').text()
      const text = rawDesc.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      const pubDate = item.find('pubDate').text().trim()
      const link = item.find('link').text().trim() || item.find('guid').text().trim()

      if (!title || text.length < 30) return

      const combined = `${title} ${text}`.toLowerCase()
      const isEvent = EVENT_KEYWORDS.some((kw) => combined.includes(kw))
      if (!isEvent) return

      events.push({
        title: title.slice(0, 200),
        raw_text: [
          pubDate ? `Data: ${pubDate}` : '',
          `Fonte: ${label}`,
          title,
          text.slice(0, 2000),
        ].filter(Boolean).join('\n'),
        source_url: link || url,
        source_name: 'centrisociali',
      })
    })
  } catch (err) {
    console.error(`[centrisociali] failed to scrape ${label}:`, err)
  }

  return events
}
