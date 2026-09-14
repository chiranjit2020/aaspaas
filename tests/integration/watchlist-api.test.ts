import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";

/**
 * Exercises GET /api/moderation/queue's watchlist tab and
 * POST /api/moderation/watchlist/[id] (dismiss/remove) — §2.2's 21-50
 * spam-score band ("published, flagged=true").
 */
let mongod: MongoMemoryServer;
let queueGET: typeof import("@/app/api/moderation/queue/route").GET;
let watchlistPOST: typeof import("@/app/api/moderation/watchlist/[id]/route").POST;
let signAccessToken: typeof import("@/lib/auth/jwt").signAccessToken;
let ACCESS_COOKIE: string;
let categoryId: ObjectId;
let moderatorCookie: string;
let contributorCookie: string;

function cookieRequest(url: string, cookie: string | undefined, body?: unknown) {
  return new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function insertWatchlistedPlace(name: string, overrides: Record<string, unknown> = {}) {
  const { getPlacesCollection } = await import("@/lib/db/models/place");
  const places = await getPlacesCollection();
  const now = new Date();
  const doc = {
    _id: new ObjectId(),
    name,
    slug: name.toLowerCase().replace(/\s+/g, "-"),
    categoryId,
    district: "North 24 Parganas",
    locality: "Habra",
    pincode: "743263",
    location: { type: "Point" as const, coordinates: [88.69, 22.84] as [number, number] },
    createdBy: null,
    ownerId: null,
    status: "published" as const,
    spamScore: 35,
    spamReasons: ["account less than a week old", "email not verified"],
    verificationCount: 0,
    usefulCount: 0,
    notUsefulCount: 0,
    duplicateOfPlaceId: null,
    tier: "free" as const,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
  await places.insertOne(doc);
  return doc._id;
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  process.env.MONGODB_DB_NAME = "aaspaas_test";
  process.env.JWT_ACCESS_SECRET = "test-secret-do-not-use-in-real-life";

  ({ GET: queueGET } = await import("@/app/api/moderation/queue/route"));
  ({ POST: watchlistPOST } = await import("@/app/api/moderation/watchlist/[id]/route"));
  ({ signAccessToken } = await import("@/lib/auth/jwt"));
  ({ ACCESS_COOKIE } = await import("@/lib/auth/session"));

  const { getCategoriesCollection } = await import("@/lib/db/models/category");
  const categories = await getCategoriesCollection();
  categoryId = new ObjectId();
  await categories.insertOne({
    _id: categoryId,
    slug: "watchlist-cat",
    name: "Misc",
    icon: "help-circle",
    synonyms: [],
  });

  const { getUsersCollection } = await import("@/lib/db/models/user");
  const users = await getUsersCollection();
  const baseUser = {
    displayName: "Test User",
    email: "irrelevant@example.com",
    emailVerified: true,
    passwordHash: "irrelevant",
    reputationLevel: "newcomer" as const,
    stats: {
      placesAdded: 0,
      placesVerified: 0,
      correctionsMade: 0,
      reportsFiled: 0,
      usefulVotesReceived: 0,
      rejectedSubmissions: 0,
      spamReportsAgainst: 0,
    },
    accountStatus: "active" as const,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const moderatorId = new ObjectId();
  await users.insertOne({ ...baseUser, _id: moderatorId, username: "watchmod", roles: ["MODERATOR"] });
  const moderatorToken = await signAccessToken({
    sub: moderatorId.toHexString(),
    username: "watchmod",
    roles: ["MODERATOR"],
    emailVerified: true,
  });
  moderatorCookie = `${ACCESS_COOKIE}=${moderatorToken}`;

  const contributorId = new ObjectId();
  await users.insertOne({ ...baseUser, _id: contributorId, username: "watchuser", roles: ["CONTRIBUTOR"] });
  const contributorToken = await signAccessToken({
    sub: contributorId.toHexString(),
    username: "watchuser",
    roles: ["CONTRIBUTOR"],
    emailVerified: true,
  });
  contributorCookie = `${ACCESS_COOKIE}=${contributorToken}`;
}, 60_000);

afterAll(async () => {
  await mongod?.stop();
});

describe("GET /api/moderation/queue — watchlist tab", () => {
  it("lists a published place whose spamScore is in the 21-50 band", async () => {
    await insertWatchlistedPlace("Watchlisted Shop");
    const res = await queueGET(cookieRequest("http://localhost/api/moderation/queue", moderatorCookie));
    expect(res.status).toBe(200);
    const body = await res.json();
    const item = body.watchlist.find((w: { name: string }) => w.name === "Watchlisted Shop");
    expect(item).toBeDefined();
    expect(item.spamScore).toBe(35);
    expect(item.spamReasons.length).toBeGreaterThan(0);
  });

  it("excludes a published place with a clean (0-20) spamScore", async () => {
    await insertWatchlistedPlace("Clean Shop", { spamScore: 5, spamReasons: [] });
    const res = await queueGET(cookieRequest("http://localhost/api/moderation/queue", moderatorCookie));
    const body = await res.json();
    expect(body.watchlist.some((w: { name: string }) => w.name === "Clean Shop")).toBe(false);
  });

  it("excludes a place already dismissed (spamReviewedAt set)", async () => {
    await insertWatchlistedPlace("Already Reviewed Shop", { spamReviewedAt: new Date() });
    const res = await queueGET(cookieRequest("http://localhost/api/moderation/queue", moderatorCookie));
    const body = await res.json();
    expect(body.watchlist.some((w: { name: string }) => w.name === "Already Reviewed Shop")).toBe(false);
  });
});

describe("POST /api/moderation/watchlist/[id]", () => {
  it("403s a non-moderator", async () => {
    const id = await insertWatchlistedPlace("Guarded Watchlist Shop");
    const res = await watchlistPOST(
      cookieRequest(`http://localhost/api/moderation/watchlist/${id}`, contributorCookie, { action: "dismiss" }),
      { params: Promise.resolve({ id: id.toHexString() }) },
    );
    expect(res.status).toBe(403);
  });

  it("'dismiss' sets spamReviewedAt without touching spamScore or status", async () => {
    const id = await insertWatchlistedPlace("Dismiss Me Shop");
    const res = await watchlistPOST(
      cookieRequest(`http://localhost/api/moderation/watchlist/${id}`, moderatorCookie, { action: "dismiss" }),
      { params: Promise.resolve({ id: id.toHexString() }) },
    );
    expect(res.status).toBe(200);

    const { getPlacesCollection } = await import("@/lib/db/models/place");
    const places = await getPlacesCollection();
    const doc = await places.findOne({ _id: id });
    expect(doc?.status).toBe("published");
    expect(doc?.spamScore).toBe(35); // untouched, for audit
    expect(doc?.spamReviewedAt).toBeTruthy();
  });

  it("'remove' takes the place down", async () => {
    const id = await insertWatchlistedPlace("Remove Me Shop");
    const res = await watchlistPOST(
      cookieRequest(`http://localhost/api/moderation/watchlist/${id}`, moderatorCookie, { action: "remove" }),
      { params: Promise.resolve({ id: id.toHexString() }) },
    );
    expect(res.status).toBe(200);

    const { getPlacesCollection } = await import("@/lib/db/models/place");
    const places = await getPlacesCollection();
    const doc = await places.findOne({ _id: id });
    expect(doc?.status).toBe("removed");
  });

  it("404s a place that isn't on the watchlist anymore", async () => {
    const id = await insertWatchlistedPlace("Double Dismiss Shop");
    await watchlistPOST(
      cookieRequest(`http://localhost/api/moderation/watchlist/${id}`, moderatorCookie, { action: "dismiss" }),
      { params: Promise.resolve({ id: id.toHexString() }) },
    );
    const second = await watchlistPOST(
      cookieRequest(`http://localhost/api/moderation/watchlist/${id}`, moderatorCookie, { action: "dismiss" }),
      { params: Promise.resolve({ id: id.toHexString() }) },
    );
    expect(second.status).toBe(404);
  });

  const moderationActionsCheck = async (targetId: ObjectId, action: string) => {
    const { getModerationActionsCollection } = await import("@/lib/db/models/moderationAction");
    const actions = await getModerationActionsCollection();
    return actions.findOne({ targetId, action });
  };

  it("logs the decision to moderation_actions", async () => {
    const id = await insertWatchlistedPlace("Logged Shop");
    await watchlistPOST(
      cookieRequest(`http://localhost/api/moderation/watchlist/${id}`, moderatorCookie, { action: "remove" }),
      { params: Promise.resolve({ id: id.toHexString() }) },
    );
    const action = await moderationActionsCheck(id, "remove_from_watchlist");
    expect(action).toBeTruthy();
  });
});
