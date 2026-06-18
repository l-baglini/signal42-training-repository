// Scraper for cgsse.it — Commissione di Garanzia degli Scioperi
// NOTE: cgsse.it blocks external requests (HTTP 000 from Vercel).
// Kept as a stub for future re-enabling if the site becomes accessible.

import type { RawEvent } from '@/types/event'

export async function scrapeCgsse(): Promise<RawEvent[]> {
  console.warn('[cgsse] skipped — site unreachable from external IPs')
  return []
}
