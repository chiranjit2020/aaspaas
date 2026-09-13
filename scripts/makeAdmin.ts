/**
 * Promotes a user to ADMIN so you can actually test the moderation queue
 * locally. There's no UI for this anywhere on purpose — role grants are a
 * manual ops task, not a self-service feature, even for a solo-dev V1.
 *
 * Usage: npm run make-admin -- <username>
 */
import { loadEnv } from "./_env";
loadEnv();

import { MongoClient } from "mongodb";

async function main() {
  const username = process.argv[2];
  if (!username) {
    console.error("Usage: npm run make-admin -- <username>");
    process.exit(1);
  }

  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB_NAME ?? "aaspaas_dev";
  if (!uri) {
    throw new Error("MONGODB_URI is not set. Copy .env.example to .env.local first.");
  }

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);
  const users = db.collection("users");

  const result = await users.findOneAndUpdate(
    { username: username.toLowerCase() },
    { $addToSet: { roles: "ADMIN" }, $set: { updatedAt: new Date() } },
    { returnDocument: "after" },
  );

  if (!result) {
    console.error(`No user found with username "${username}".`);
    process.exit(1);
  }

  console.log(`${result.username} is now: ${result.roles.join(", ")}`);
  await client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
