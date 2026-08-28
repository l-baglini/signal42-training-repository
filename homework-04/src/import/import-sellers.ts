import { DateTime } from 'luxon';
import { close, connect } from '../db';
import { ssps } from '../ssp-list';
import { SellerRecord, SellersJson } from '../types';

const FETCH_TIMEOUT_MS = 60_000;

/** Fetches every SSP's `sellers.json` and stores newly seen sellers. */
export async function importSellers(): Promise<void> {
  const database = await connect();
  try {
    const collection = database.collection<SellerRecord>('sellers');
    console.log(`Sellers ${DateTime.now().toFormat('dd/MM/yyyy HH:mm')} import begin`);

    for (const ssp of ssps) {
      try {
        const count = await collection.countDocuments({ sspDomain: ssp.domain });
        console.log(`Fetching ${ssp.domain} sellers`);
        const response = await fetch(`https://${ssp.domain}/sellers.json`, {
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });

        if (!response.ok) {
          console.warn(`Skipping ${ssp.domain}: HTTP ${response.status}`);
          continue;
        }

        console.log(`Parsing ${ssp.domain} sellers`);
        const { sellers = [] } = (await response.json()) as SellersJson;

        console.log(count === 0 ? `Scanning ${ssp.domain} for new sellers` : `Adding ${ssp.domain} sellers`);
        for (let i = 0; i < sellers.length; i++) {
          const { seller_id, name, seller_type, domain } = sellers[i];
          const sellerId = ssp.numericSellerId ? parseInt(seller_id, 10) : seller_id;

          const existing = await collection.findOne({ sellerId, sspDomain: ssp.domain });
          if (existing == null) {
            console.log(
              `Collected seller ${name} with ${ssp.numericSellerId ? 'numeric' : 'string'} ID ${sellerId} from ${ssp.domain}`,
            );
            await collection.insertOne({
              sspDomain: ssp.domain,
              sellerId,
              sellerPosition: i,
              wasInsertedOnFirstImport: count === 0,
              sellerName: name,
              sellerDomain: domain,
              sellerType: seller_type,
              importDate: new Date(),
            });
          }
        }
        console.log(`Imported ${ssp.domain} successfully`);
      } catch (error) {
        console.error(`Failed to import ${ssp.domain}: ${error instanceof Error ? error.message : error}`);
        continue;
      }
    }
    console.log('All sellers imported successfully');
  } finally {
    await close();
  }
}
