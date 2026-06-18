// Scraper for scioperi.mit.gov.it — Ministero delle Infrastrutture e dei Trasporti
// Uses the official RSS feed (the HTML page loads data via AJAX/DataTables)

import * as cheerio from 'cheerio'
import type { RawEvent } from '@/types/event'

const RSS_URL = 'https://scioperi.mit.gov.it/mit2/public/scioperi/rss'

export async function scrapeMit(): Promise<RawEvent[]> {
  const events: RawEvent[] = []

  try {
    const res = await fetch(RSS_URL, {
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
      const desc = item.find('description').text().replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim()
      const pubDate = item.find('pubDate').text().trim()
      const guid = item.find('guid').text().trim()

      if (!title) return

      // GUID has the form http://scioperi.mit.gov.it/8399 — that URL 404s.
      // Use the working list page with an anchor so each event keeps a unique, functional URL.
      const mitId = guid?.split('/').filter(Boolean).pop()
      const sourceUrl = mitId
        ? `https://scioperi.mit.gov.it/mit2/public/scioperi#${mitId}`
        : 'https://scioperi.mit.gov.it/mit2/public/scioperi'

      events.push({
        title: title.slice(0, 200),
        raw_text: [
          pubDate ? `Data: ${pubDate}` : '',
          title,
          desc,
        ].filter(Boolean).join('\n'),
        source_url: sourceUrl,
        source_name: 'mit',
      })
    })
  } catch (err) {
    console.error('[mit] scrape failed:', err)
  }

  return events
}
