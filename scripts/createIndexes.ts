/**
 * Run once per environment (part of M0/M1 setup) and again after any schema
 * change. The index definitions themselves live in src/lib/db/createIndexes.ts
 * (importable — tests/e2e/global-setup.ts reuses the exact same function);
 * this file is just the CLI entry point.
 *
 * Usage: npm run create-indexes
 */
import { loadEnv } from "./_env";
loadEnv();

import { MongoClient } from "mongodb";
import { createIndexes } from "../src/lib/db/createIndexes";

async function main() {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB_NAME ?? "aaspaas_dev";
  if (!uri) {
    throw new Error("MONGODB_URI is not set. Copy .env.example to .env.local first.");
  }

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);

  console.log(`Creating indexes on ${dbName}...`);
  await createIndexes(db);
  await client.close();
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
