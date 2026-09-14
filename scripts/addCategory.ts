/**
 * Additively inserts one category under an existing parent — for adding a
 * category (like "Other") after launch without touching `places` or wiping
 * the rest of `categories`, unlike `npm run seed` (which is dev/test only
 * and destroys real data if pointed at prod).
 *
 * Idempotent: does nothing if a category with this slug already exists.
 *
 * Usage: npm run add-category -- <slug> <name> <icon> <parentSlug> <synonym1,synonym2,...>
 * Example: npm run add-category -- other-service Other help-circle services "other,other service,miscellaneous,general service"
 */
import { loadEnv } from "./_env";
loadEnv();

import { MongoClient, ObjectId } from "mongodb";

async function main() {
  const [slug, name, icon, parentSlug, synonymsRaw] = process.argv.slice(2);
  if (!slug || !name || !icon || !parentSlug) {
    console.error(
      "Usage: npm run add-category -- <slug> <name> <icon> <parentSlug> <synonym1,synonym2,...>",
    );
    process.exit(1);
  }
  const synonyms = (synonymsRaw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB_NAME ?? "aaspaas_dev";
  if (!uri) {
    throw new Error("MONGODB_URI is not set. Copy .env.example to .env.local first.");
  }

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);
  const categories = db.collection("categories");

  console.log(`Connected to database: ${dbName}`);

  const existing = await categories.findOne({ slug });
  if (existing) {
    console.log(`Category "${slug}" already exists (_id ${existing._id}) — nothing to do.`);
    await client.close();
    return;
  }

  const parent = await categories.findOne({ slug: parentSlug });
  if (!parent) {
    console.error(`Parent category "${parentSlug}" not found. Aborting.`);
    await client.close();
    process.exit(1);
  }

  const doc = {
    _id: new ObjectId(),
    slug,
    name,
    parentCategoryId: parent._id,
    icon,
    synonyms,
  };
  await categories.insertOne(doc);
  console.log(`Inserted category "${name}" (slug: ${slug}) under "${parent.name}".`);

  await client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
