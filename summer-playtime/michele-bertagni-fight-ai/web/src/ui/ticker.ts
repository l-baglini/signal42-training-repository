/**
 * Shows the Reddit title behind the current exchange.
 *
 * Every write here uses textContent. Never innerHTML: the text comes from
 * strangers on the internet (docs/SECURITY.md section 6).
 */
const el = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing element #${id}`);
  return node as T;
};

export class Ticker {
  private titleEl = el<HTMLAnchorElement>('ticker-title');
  private badgeEl = el<HTMLSpanElement>('ticker-badge');
  private subEl = el<HTMLSpanElement>('ticker-sub');
  private sourceEl = el<HTMLSpanElement>('ticker-source');

  show(entry: {
    title: string;
    permalink: string;
    subreddit: string;
    flagged: boolean;
    source: 'model' | 'fallback';
  }): void {
    this.titleEl.textContent = entry.title;          // text, never markup
    this.titleEl.href = this.safeHref(entry.permalink);
    // Posts come from more than one community, so say which one threw the punch.
    this.subEl.textContent = entry.subreddit ? `r/${entry.subreddit}` : '';
    this.badgeEl.classList.toggle('hidden', !entry.flagged);
    this.sourceEl.textContent = entry.source === 'fallback' ? 'offline scoring' : '';
  }

  /** Only http(s) links survive - no javascript:, no data:. */
  private safeHref(raw: string): string {
    try {
      const url = new URL(raw);
      return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : '#';
    } catch {
      return '#';
    }
  }
}
