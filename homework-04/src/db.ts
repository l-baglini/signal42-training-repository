import { Db, MongoClient } from 'mongodb';
import { config } from './config';

let client: MongoClient | undefined;

/** Opens a connection to MongoDB and returns the configured database. */
export async function connect(): Promise<Db> {
  client = new MongoClient(config.database.url);
  await client.connect();
  return client.db(config.database.name);
}

/** Closes the active MongoDB connection, if any. */
export async function close(): Promise<void> {
  await client?.close();
  client = undefined;
}
