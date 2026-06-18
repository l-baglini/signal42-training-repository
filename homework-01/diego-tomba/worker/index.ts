/**
 * worker/index.ts
 * ---------------
 * Standalone scheduler daemon entrypoint.
 *
 * Run it with: `npm run worker`. Keep it alive in the background with your
 * process manager of choice (nohup / pm2 / systemd).
 */

import { startScheduler } from './scheduler.ts';

startScheduler().catch((err) => {
  console.error('[worker] Fatal:', err);
  process.exit(1);
});
