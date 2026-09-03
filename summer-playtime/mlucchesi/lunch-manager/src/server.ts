import "dotenv/config";
import { createApp } from "./app";
import { createDb, seedIfEmpty } from "./db";

const PORT = Number(process.env.PORT) || 8900;
const DATABASE_PATH = process.env.DATABASE_PATH || "./data/lunch-manager.sqlite";

const db = createDb(DATABASE_PATH);
seedIfEmpty(db);

const app = createApp(db);
app.listen(PORT, () => {
  console.log(`Lunch Manager listening on http://localhost:${PORT}`);
});
