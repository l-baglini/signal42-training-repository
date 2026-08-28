import cron from 'node-cron';
import { importSellers } from './import-sellers';

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
