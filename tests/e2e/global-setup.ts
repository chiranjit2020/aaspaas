import { config } from "dotenv";
import path from "node:path";
import {
  CATEGORY_ID,
  CATEGORY_NAME,
  CATEGORY_SLUG,
  MODERATOR,
  PARENT_CATEGORY_ID,
  PARENT_CATEGORY_NAME,
  PARENT_CATEGORY_SLUG,
} from "./fixtures";

/**
 * Runs once before the whole Playwright suite. Wipes and reseeds a
 * dedicated e2e database — never the dev/staging/prod ones the rest of the
 * app uses. The `_e2e` suffix check is a hard stop against ever pointing
 * this at a real database by a copy-pasted .env value.
 */
export default async function globalSetup(): Promise<void> {
  config({ path: path.resolve(__dirname, "../../.env.test") });

  const dbName = process.env.MONGODB_DB_NAME ?? "";
  if (!dbName.endsWith("_e2e")) {
    throw new Error(
      `Refusing to run e2e global-setup against MONGODB_DB_NAME="${dbName}" — ` +
        `it must end in "_e2e" (see .env.test.example). This guard exists so a ` +
        `misconfigured .env.test can never wipe a real database.`,
    );
  }

  const { getDb } = await import("@/lib/db/connect");
  const { hashPassword } = await import("@/lib/auth/password");
  const { createIndexes } = await import("@/lib/db/createIndexes");

  const db = await getDb();
  await Promise.all(
    ["users", "places", "categories", "reports", "place_edits", "place_photos", "useful_votes"].map(
      (name) => db.collection(name).deleteMany({}),
    ),
  );
  // Without this, $text search (search.spec.ts) and $geoNear both fail at
  // query time — Mongo requires the index to exist, not just be "faster
  // with one."
  await createIndexes(db);

  await db.collection("categories").insertMany([
    {
      _id: PARENT_CATEGORY_ID,
      slug: PARENT_CATEGORY_SLUG,
      name: PARENT_CATEGORY_NAME,
      icon: "utensils",
      synonyms: [PARENT_CATEGORY_SLUG],
      parentCategoryId: null,
    },
    {
      _id: CATEGORY_ID,
      slug: CATEGORY_SLUG,
      name: CATEGORY_NAME,
      icon: "cake",
      synonyms: [CATEGORY_SLUG],
      parentCategoryId: PARENT_CATEGORY_ID,
    },
  ]);

  const now = new Date();
  await db.collection("users").insertOne({
    displayName: "E2E Moderator",
    username: MODERATOR.username,
    email: MODERATOR.email,
    emailVerified: true,
    passwordHash: await hashPassword(MODERATOR.password),
    roles: ["MODERATOR"],
    reputationLevel: "newcomer",
    stats: {
      placesAdded: 0,
      placesVerified: 0,
      correctionsMade: 0,
      reportsFiled: 0,
      usefulVotesReceived: 0,
      rejectedSubmissions: 0,
      spamReportsAgainst: 0,
    },
    accountStatus: "active",
    createdAt: now,
    updatedAt: now,
  });
}
