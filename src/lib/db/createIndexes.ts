import type { Db } from "mongodb";

/**
 * Indexes listed here match 07-roadmap-and-architecture.md §1.4 exactly —
 * that section *is* this file, kept in sync deliberately.
 *
 * Lives in src/lib/ (importable), not scripts/ (CLI-only entry points),
 * specifically so tests/e2e/global-setup.ts can run the exact same index
 * creation against its throwaway database — without it, $text search and
 * $geoNear both fail at query time, not just "run slowly," since Mongo
 * requires the underlying index to exist at all.
 */
export async function createIndexes(db: Db): Promise<void> {
  const places = db.collection("places");
  await places.createIndex({ location: "2dsphere" }, { name: "location_2dsphere" });
  await places.createIndex(
    { name: "text", description: "text" },
    { name: "name_description_text", weights: { name: 10, description: 1 } },
  );
  await places.createIndex(
    { district: 1, locality: 1, pincode: 1, categoryId: 1, status: 1 },
    { name: "district_locality_pincode_category_status" },
  );
  await places.createIndex({ slug: 1 }, { unique: true, name: "slug_unique" });
  console.log(
    "  places: 2dsphere, text (name^10/description^1), compound filter index, unique slug (addition beyond §1.4)",
  );

  const users = db.collection("users");
  await users.createIndex({ username: 1 }, { unique: true, name: "username_unique" });
  await users.createIndex({ email: 1 }, { unique: true, name: "email_unique" });
  console.log("  users: unique username, unique email");

  const usefulVotes = db.collection("useful_votes");
  await usefulVotes.createIndex(
    { placeId: 1, userId: 1 },
    { unique: true, name: "place_user_unique" },
  );
  console.log("  useful_votes: unique (placeId, userId)");

  const reports = db.collection("reports");
  await reports.createIndex({ status: 1, createdAt: -1 }, { name: "status_createdAt" });
  console.log("  reports: (status, createdAt desc) for the moderation queue");

  const placeEdits = db.collection("place_edits");
  await placeEdits.createIndex({ placeId: 1, createdAt: -1 }, { name: "place_createdAt" });
  console.log("  place_edits: (placeId, createdAt desc)");

  const refreshTokens = db.collection("refresh_tokens");
  await refreshTokens.createIndex(
    { expiresAt: 1 },
    { expireAfterSeconds: 0, name: "expiresAt_ttl" },
  );
  console.log("  refresh_tokens: TTL on expiresAt");

  // Not in the roadmap's explicit list, but categories need unique, routable slugs.
  const categories = db.collection("categories");
  await categories.createIndex({ slug: 1 }, { unique: true, name: "slug_unique" });
  console.log("  categories: unique slug (addition beyond §1.4, needed for routing)");

  // M2 additions — also beyond §1.4's original list, added as these
  // collections were actually wired up.
  const emailVerificationTokens = db.collection("email_verification_tokens");
  await emailVerificationTokens.createIndex(
    { expiresAt: 1 },
    { expireAfterSeconds: 0, name: "expiresAt_ttl" },
  );
  console.log("  email_verification_tokens: TTL on expiresAt");

  const rateLimitCounters = db.collection("rate_limit_counters");
  await rateLimitCounters.createIndex(
    { expiresAt: 1 },
    { expireAfterSeconds: 0, name: "expiresAt_ttl" },
  );
  console.log("  rate_limit_counters: TTL on expiresAt");

  // M3 addition — the existing places compound index leads with
  // district/locality/pincode/categoryId, wrong prefix order for the
  // moderation queue's "all pending, oldest first" access pattern.
  await places.createIndex({ status: 1, createdAt: 1 }, { name: "status_createdAt" });
  console.log("  places: (status, createdAt asc) for the moderation queue (addition beyond §1.4)");

  // M4 addition — same reasoning as places above: place_edits' §1.4 index
  // leads with placeId (for a single place's edit history), not status (for
  // the moderation queue's "all pending edits across every place" query).
  await placeEdits.createIndex({ status: 1, createdAt: 1 }, { name: "status_createdAt" });
  console.log("  place_edits: (status, createdAt asc) for the moderation queue (addition beyond §1.4)");

  // M5 additions — spamScore.ts's real DB queries, none of which fit the
  // existing indexes' prefixes.
  await places.createIndex({ createdBy: 1, createdAt: -1 }, { name: "createdBy_createdAt" });
  console.log("  places: (createdBy, createdAt desc) for submission-velocity scoring + contributor profiles");
  await places.createIndex({ phone: 1 }, { name: "phone", sparse: true });
  console.log("  places: (phone), sparse — same-phone-reuse scoring");
  await places.createIndex({ locality: 1, status: 1 }, { name: "locality_status" });
  console.log(
    "  places: (locality, status) — geo-consistency scoring and duplicateDetection's locality-scoped candidate query (M3, never indexed until now)",
  );
  await places.createIndex(
    { status: 1, spamScore: 1 },
    { name: "status_spamScore", partialFilterExpression: { status: "published" } },
  );
  console.log("  places: (status, spamScore), partial on published — the moderator watchlist query");
  await reports.createIndex({ placeId: 1 }, { name: "placeId" });
  console.log("  reports: (placeId) — counting reports against a contributor's other places");

  // Photo upload — the moderation queue's "all pending photos" query plus a
  // single place's approved-gallery lookup.
  const placePhotos = db.collection("place_photos");
  await placePhotos.createIndex(
    { placeId: 1, moderationStatus: 1, uploadedAt: -1 },
    { name: "place_moderationStatus_uploadedAt" },
  );
  console.log("  place_photos: (placeId, moderationStatus, uploadedAt desc)");
}
