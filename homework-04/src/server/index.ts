import { createApp } from './app';
import { config } from '../config';
import { close, connect } from '../db';

async function main(): Promise<void> {
  const database = await connect();
  const app = createApp(database);

  const server = app.listen(config.port, () => {
    console.log(`Server listening on http://0.0.0.0:${config.port}`);
  });

  // Graceful shutdown so Fargate can stop the task cleanly on SIGTERM.
  const shutdown = async (signal: string): Promise<void> => {
    console.log(`Received ${signal}, shutting down`);
    server.close();
    await close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
