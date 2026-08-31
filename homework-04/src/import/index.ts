import cron from 'node-cron';
import { DateTime } from 'luxon';
import { close, connect } from '../db';
import { ssps } from '../ssp-list';
import { SellerRecord, SellersJson } from '../types';

const FETCH_TIMEOUT_MS = 60_000;

/** Fetches every SSP's `sellers.json` and stores newly seen sellers. */
async function importSellers(): Promise<void> {
  const database = await connect();
  try {
    const collection = database.collection<SellerRecord>('sellers');
    console.log(`Sellers ${DateTime.now().toFormat('dd/MM/yyyy HH:mm')} import begin`);

    for (const ssp of ssps) {
      const count = await collection.countDocuments({ sspDomain: ssp.domain });
      console.log(`Fetching ${ssp.domain} sellers`);
      const response = await fetch(`https://${ssp.domain}/sellers.json`, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });

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
    }
    console.log('All sellers imported successfully');
  } finally {
    await close();
  }
}

async function main(): Promise<void> {
  // `--now` runs a single import and exits — the mode used by an ECS Scheduled
  // Task (EventBridge). Without it, an in-container cron runs daily instead.
  if (process.argv.includes('--now')) {
    await importSellers();
    return;
  }

  cron.schedule('0 4 * * *', () => void importSellers(), { timezone: 'Europe/Rome' });
  console.log('Import scheduler started (daily at 04:00 Europe/Rome)');
}

main().catch((error) => {
  console.error(`Sellers import failed: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
