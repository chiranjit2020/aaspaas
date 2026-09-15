import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";

/**
 * Exercises PATCH /api/places/[id] (propose an edit) and
 * GET /api/places/[id]/edits (edit history) against a real in-memory Mongo —
 * same pattern as places-api.test.ts.
 */
let mongod: MongoMemoryServer;
let PATCH: typeof import("@/app/api/places/[id]/route").PATCH;
let editsGET: typeof import("@/app/api/places/[id]/edits/route").GET;
let signAccessToken: typeof import("@/lib/auth/jwt").signAccessToken;
let ACCESS_COOKIE: string;
let categoryId: ObjectId;
let placeId: ObjectId;
let ownerId: ObjectId;
let editorId: ObjectId;
let sessionCookie: string;

function patchRequest(body: unknown, cookie?: string) {
  return new NextRequest("http://localhost/api/places/x", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  process.env.MONGODB_DB_NAME = "aaspaas_test";
  process.env.JWT_ACCESS_SECRET = "test-secret-do-not-use-in-real-life";

  ({ PATCH } = await import("@/app/api/places/[id]/route"));
  ({ GET: editsGET } = await import("@/app/api/places/[id]/edits/route"));
  ({ signAccessToken } = await import("@/lib/auth/jwt"));
  ({ ACCESS_COOKIE } = await import("@/lib/auth/session"));
  const { getCategoriesCollection } = await import("@/lib/db/models/category");
  const { getUsersCollection } = await import("@/lib/db/models/user");
  const { getPlacesCollection } = await import("@/lib/db/models/place");

  const categories = await getCategoriesCollection();
  categoryId = new ObjectId();
  await categories.insertOne({
    _id: categoryId,
    slug: "tailoring",
    name: "Tailoring",
    icon: "scissors",
    synonyms: ["tailor"],
  });

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
    // Old on purpose — see places-api.test.ts's identical comment: M5's
    // spamScore.ts scores a brand-new account +20 on age alone, which would
    // make a "clean edit" here land on the watchlist boundary instead of
    // auto-approving.
    createdAt: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000),
    updatedAt: new Date(),
  };

  ownerId = new ObjectId();
  await users.insertOne({ ...baseUser, _id: ownerId, username: "shopowner", roles: ["CONTRIBUTOR"] });

  editorId = new ObjectId();
  await users.insertOne({ ...baseUser, _id: editorId, username: "correctoruser", roles: ["CONTRIBUTOR"] });
  const token = await signAccessToken({
    sub: editorId.toHexString(),
    username: "correctoruser",
    roles: ["CONTRIBUTOR"],
    emailVerified: true,
  });
  sessionCookie = `${ACCESS_COOKIE}=${token}`;

  const places = await getPlacesCollection();
  placeId = new ObjectId();
  const now = new Date();
  await places.insertOne({
    _id: placeId,
    name: "Sri Tailors",
    slug: "sri-tailors",
    categoryId,
    phone: "9830000000",
    district: "North 24 Parganas",
    locality: "Habra",
    pincode: "743263",
    location: { type: "Point", coordinates: [88.69, 22.84] },
    createdBy: ownerId,
    ownerId: null,
    status: "published",
    spamScore: 0,
    verificationCount: 0,
    usefulCount: 0,
    notUsefulCount: 0,
    duplicateOfPlaceId: null,
    tier: "free",
    createdAt: now,
    updatedAt: now,
  });
}, 60_000);

afterAll(async () => {
  await mongod?.stop();
});

describe("PATCH /api/places/[id] — propose an edit", () => {
  it("rejects an unauthenticated proposal", async () => {
    const res = await PATCH(patchRequest({ phone: "9831111111" }), {
      params: Promise.resolve({ id: placeId.toHexString() }),
    });
    expect(res.status).toBe(401);
  });

  it("rejects a body with no proposed fields", async () => {
    const res = await PATCH(patchRequest({}, sessionCookie), {
      params: Promise.resolve({ id: placeId.toHexString() }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects an edit that matches what's already published", async () => {
    const res = await PATCH(patchRequest({ phone: "9830000000" }, sessionCookie), {
      params: Promise.resolve({ id: placeId.toHexString() }),
    });
    expect(res.status).toBe(400);
  });

  it("404s a place that doesn't exist", async () => {
    const res = await PATCH(patchRequest({ phone: "9831111111" }, sessionCookie), {
      params: Promise.resolve({ id: new ObjectId().toHexString() }),
    });
    expect(res.status).toBe(404);
  });

  it("records only the changed fields, and a clean low-risk edit still waits for admin approval", async () => {
    const res = await PATCH(
      patchRequest({ phone: "9831111111", locality: "Habra", reason: "number changed" }, sessionCookie),
      { params: Promise.resolve({ id: placeId.toHexString() }) },
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.status).toBe("pending");

    const { getPlaceEditsCollection } = await import("@/lib/db/models/placeEdit");
    const placeEdits = await getPlaceEditsCollection();
    const edit = await placeEdits.findOne({ _id: new ObjectId(body.id) });
    expect(edit?.userId.equals(editorId)).toBe(true);
    expect(edit?.reason).toBe("number changed");
    // locality matched the current value, so it's dropped from the diff.
    expect(edit?.changes).toEqual({ phone: { old: "9830000000", new: "9831111111" } });
    expect(edit?.spamScore).toBeLessThanOrEqual(20);

    const { getPlacesCollection } = await import("@/lib/db/models/place");
    const places = await getPlacesCollection();
    const place = await places.findOne({ _id: placeId });
    expect(place?.phone).toBe("9830000000"); // NOT applied yet — awaiting moderator approval

    const { getUsersCollection } = await import("@/lib/db/models/user");
    const users = await getUsersCollection();
    const editor = await users.findOne({ _id: editorId });
    expect(editor?.stats.correctionsMade).toBe(0); // only increments on actual approval
  });
});

describe("GET /api/places/[id]/edits — edit history", () => {
  it("404s a place that doesn't exist", async () => {
    const res = await editsGET(new Request("http://localhost/api/places/x/edits"), {
      params: Promise.resolve({ id: new ObjectId().toHexString() }),
    });
    expect(res.status).toBe(404);
  });

  it("lists the proposed edit with contributor attribution, no auth required", async () => {
    const res = await editsGET(new Request("http://localhost/api/places/x/edits"), {
      params: Promise.resolve({ id: placeId.toHexString() }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items[0].contributor.username).toBe("correctoruser");
    expect(body.items[0].status).toBe("pending");
  });
});
