import { Collection } from 'mongodb';
import { DateTime } from 'luxon';
import { ssps } from '../ssp-list';
import { SellerRecord } from '../types';

/** Seller-name markers that identify an Open Bidding integration. */
const OPEN_BIDDING_MARKERS = ['via OB', 'via EB', 'Google EB', 'Google OB', 'EB DFP', 'OB DFP'];

const ADS_TXT_TIMEOUT_MS = 5_000;

/**
 * Fetches a domain's `ads.txt`, then annotates each entry with the matching
 * seller (name, domain, age, integration method) taken from the database.
 * Returns the annotated ads.txt as plain text.
 */
export async function parseAdsTxt(sellers: Collection<SellerRecord>, domain: string): Promise<string> {
  const response = await fetch(`https://${domain}/ads.txt`, {
    signal: AbortSignal.timeout(ADS_TXT_TIMEOUT_MS),
  });
  const adsTxtFile = await response.text();

  // Parse into [sspDomain, sellerId, relationship, comment] tuples.
  const entries: string[][] = adsTxtFile
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.replace(/ /g, '').split(','))
    .filter((entry) => entry.length >= 3)
    .map((entry) => {
      entry[0] = entry[0].toLowerCase();
      // Grab any inline comment from the last item.
      const comment = entry[entry.length - 1].split('#');
      entry[entry.length - 1] = comment[0];
      // Keep only sspDomain, sellerId, relationship (DIRECT/RESELLER).
      const tuple = entry.slice(0, 3);
      tuple.push(comment[1] ? `"${comment[1]}"` : '');
      return tuple;
    });

  // Group seller ids per SSP so each SSP is queried once.
  const sellerIdsBySsp: Record<string, string[]> = {};
  for (const [sspDomain, sellerId] of entries) {
    (sellerIdsBySsp[sspDomain] ??= []).push(sellerId);
  }

  const sellersBySsp: Record<string, SellerRecord[]> = {};
  for (const [sspDomain, rawIds] of Object.entries(sellerIdsBySsp)) {
    const ssp = ssps.find((s) => s.domain === sspDomain);
    const ids: (string | number)[] = ssp?.numericSellerId
      ? rawIds.map((id) => parseInt(id, 10))
      : rawIds;
    sellersBySsp[sspDomain] = await sellers.find({ sspDomain, sellerId: { $in: ids } }).toArray();
  }

  const rendered = entries
    .map((entry) => {
      const [sspDomain, sellerId] = entry;
      const comment = entry[3];
      const base = entry.slice(0, 3);
      // eslint-disable-next-line eqeqeq -- ids may be string or number, keep loose match
      const seller = sellersBySsp[sspDomain]?.find((s) => String(s.sellerId) === String(sellerId));

      if (seller?.sellerName) {
        const isOpenBidding = OPEN_BIDDING_MARKERS.some((marker) => seller.sellerName!.includes(marker));
        const integrationMethod = isOpenBidding ? 'Open Bidding' : 'Other';
        const ageDays = Math.floor(DateTime.now().diff(DateTime.fromJSDate(seller.importDate), 'days').days) + 1;
        const sellerAge = seller.wasInsertedOnFirstImport ? 'N/A' : `added ${ageDays} days ago`;
        return base.concat(
          [`# ${integrationMethod}`, `"${seller.sellerName}"`, seller.sellerDomain ?? '', sellerAge, comment].filter(
            Boolean,
          ) as string[],
        );
      }

      return comment ? base.concat([`# ${comment}`]) : base;
    })
    .sort();

  return rendered
    .map((entry) => entry.join(', '))
    .join('\n')
    .replace(/,\ #,/g, ' #');
}
