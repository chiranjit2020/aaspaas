import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";

/**
 * Exercises POST/GET /api/places against a real (in-memory) MongoDB, calling
 * the route handlers directly rather than mocking them — per the SDLC's
 * testing priority #2 ("integration tests on API routes against an in-memory
 * Mongo") and review.md's Part 21, which specifically calls out contributor
 * association and auth protection as things that need real test coverage,
 * not just manual verification.
 *
 * As with tests/unit/rateLimit.test.ts, env vars (MONGODB_URI,
 * JWT_ACCESS_SECRET) must be set *before* any module that reads them is
 * imported — hence everything routes/lib-dependent is loaded dynamically
 * inside beforeAll.
 */
let mongod: MongoMemoryServer;
let POST: typeof import("@/app/api/places/route").POST;
let GET: typeof import("@/app/api/places/route").GET;
let signAccessToken: typeof import("@/lib/auth/jwt").signAccessToken;
let ACCESS_COOKIE: string;
let categoryId: ObjectId;
let userId: ObjectId;
let sessionCookie: string;

const PLACE_INPUT = {
  name: "Test Integration Shop",
  categorySlug: "mobile-repair",
  district: "North 24 Parganas",
  locality: "Habra",
  pincode: "743263",
  lat: 22.84,
  lng: 88.69,
};

function postRequest(body: unknown, cookie?: string) {
  return new NextRequest("http://localhost/api/places", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  process.env.MONGODB_DB_NAME = "aaspaas_test";
  process.env.JWT_ACCESS_SECRET = "test-secret-do-not-use-in-real-life";

  ({ POST, GET } = await import("@/app/api/places/route"));
  ({ signAccessToken } = await import("@/lib/auth/jwt"));
  ({ ACCESS_COOKIE } = await import("@/lib/auth/session"));
  const { getCategoriesCollection } = await import("@/lib/db/models/category");
  const { getUsersCollection } = await import("@/lib/db/models/user");

  const categories = await getCategoriesCollection();
  categoryId = new ObjectId();
  await categories.insertOne({
    _id: categoryId,
    slug: "mobile-repair",
    name: "Mobile Repair",
    icon: "smartphone",
    synonyms: ["mobile repair"],
  });

  const users = await getUsersCollection();
  userId = new ObjectId();
  await users.insertOne({
    _id: userId,
    displayName: "Test Contributor",
    username: "testcontributor",
    email: "test@example.com",
    emailVerified: true,
    passwordHash: "irrelevant-for-this-test",
    roles: ["CONTRIBUTOR"],
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
    // Old and clean on purpose: M5's spamScore.ts scores a brand-new account
    // +20 on age alone (see spamScoring.test.ts), which would make these
    // auth/association/duplicate-detection tests' outcomes depend on
    // spam-scoring incidentally. An old, verified account keeps its baseline
    // score at (or near) 0 so status stays predictable here; the actual
    // spam-scoring behavior gets its own dedicated tests in
    // spam-score-api.test.ts.
    createdAt: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000),
    updatedAt: new Date(),
  });

  const token = await signAccessToken({
    sub: userId.toHexString(),
    username: "testcontributor",
    roles: ["CONTRIBUTOR"],
    emailVerified: true,
  });
  sessionCookie = `${ACCESS_COOKIE}=${token}`;
}, 60_000);

afterAll(async () => {
  await mongod?.stop();
});

describe("POST /api/places — auth protection", () => {
  it("rejects an unauthenticated submission", async () => {
    const res = await POST(postRequest(PLACE_INPUT));
    expect(res.status).toBe(401);
  });

  it("rejects a malformed body even when authenticated", async () => {
    const res = await POST(postRequest({ name: "x" }, sessionCookie));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/places — contributor association", () => {
  it("derives createdBy from the session; a clean submission from an established account auto-publishes", async () => {
    const res = await POST(postRequest(PLACE_INPUT, sessionCookie));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.status).toBe("published");

    const { getPlacesCollection } = await import("@/lib/db/models/place");
    const places = await getPlacesCollection();
    const doc = await places.findOne({ _id: new ObjectId(body.id) });
    expect(doc?.createdBy?.equals(userId)).toBe(true);
    expect(doc?.status).toBe("published");
  });

  it("ignores a client-supplied createdBy — the session always wins", async () => {
    const spoofedId = new ObjectId().toHexString();
    const res = await POST(
      postRequest(
        {
          ...PLACE_INPUT,
          name: "Spoof Attempt Shop",
          createdBy: spoofedId,
          // Different place than the one the previous test created — not
          // testing duplicate detection here, so acknowledge upfront rather
          // than reuse the same coordinates and get a 409 from that instead.
          acknowledgeDuplicates: true,
        },
        sessionCookie,
      ),
    );
    expect(res.status).toBe(201);
    const body = await res.json();

    const { getPlacesCollection } = await import("@/lib/db/models/place");
    const places = await getPlacesCollection();
    const doc = await places.findOne({ _id: new ObjectId(body.id) });
    expect(doc?.createdBy?.equals(userId)).toBe(true);
    expect(doc?.createdBy?.toHexString()).not.toBe(spoofedId);
  });

  it("keeps a non-published (spam-flagged) submission out of public browse/search", async () => {
    // A dedicated, brand-new, unverified user with spammy content — reliably
    // scores well above auto-publish (see spamScoring.test.ts's own coverage
    // of this exact shape of input) regardless of anything else this file's
    // shared user has submitted before this test runs.
    const { getUsersCollection } = await import("@/lib/db/models/user");
    const users = await getUsersCollection();
    const spammyUserId = new ObjectId();
    await users.insertOne({
      _id: spammyUserId,
      displayName: "Spammy User",
      username: "spammyuser",
      email: "spammy@example.com",
      emailVerified: false,
      passwordHash: "irrelevant-for-this-test",
      roles: ["CONTRIBUTOR"],
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
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const spammyToken = await signAccessToken({
      sub: spammyUserId.toHexString(),
      username: "spammyuser",
      roles: ["CONTRIBUTOR"],
      emailVerified: false,
    });

    const res = await POST(
      postRequest(
        {
          ...PLACE_INPUT,
          name: "SHOULD STAY HIDDEN SHOP",
          description: "100% free gift, click here now! www.spam-example.com",
          lat: 23.1,
          lng: 88.95, // far from every other coordinate in this file
          acknowledgeDuplicates: true,
        },
        `${ACCESS_COOKIE}=${spammyToken}`,
      ),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.status).not.toBe("published");

    const listRes = await GET(
      new NextRequest("http://localhost/api/places?locality=Habra&limit=50"),
    );
    const list = await listRes.json();
    expect(
      list.items.some((p: { name: string }) => p.name === "SHOULD STAY HIDDEN SHOP"),
    ).toBe(false);
  });
});

describe("POST /api/places — duplicate detection", () => {
  it("blocks a near-duplicate with 409 and a candidate list, before acknowledgement", async () => {
    const original = await POST(
      postRequest(
        { ...PLACE_INPUT, name: "Duplicate Origin Shop", lat: 22.9, lng: 88.75, acknowledgeDuplicates: true },
        sessionCookie,
      ),
    );
    expect(original.status).toBe(201);

    // Same locality, same spot, a plausible near-identical name.
    const res = await POST(
      postRequest(
        { ...PLACE_INPUT, name: "Duplicate Origin Shop ", lat: 22.9, lng: 88.75 },
        sessionCookie,
      ),
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.possibleDuplicates.length).toBeGreaterThan(0);
    expect(body.possibleDuplicates[0].name).toBe("Duplicate Origin Shop");
  });

  it("creates the place and records duplicateOfPlaceId once acknowledged", async () => {
    const res = await POST(
      postRequest(
        {
          ...PLACE_INPUT,
          name: "Duplicate Origin Shop",
          lat: 22.9,
          lng: 88.75,
          acknowledgeDuplicates: true,
        },
        sessionCookie,
      ),
    );
    expect(res.status).toBe(201);
    const body = await res.json();

    const { getPlacesCollection } = await import("@/lib/db/models/place");
    const places = await getPlacesCollection();
    const doc = await places.findOne({ _id: new ObjectId(body.id) });
    expect(doc?.duplicateOfPlaceId).not.toBeNull();
  });

  it("does not flag genuinely distinct places in the same locality", async () => {
    // Far from every coordinate any other test in this file uses.
    const res = await POST(
      postRequest(
        {
          ...PLACE_INPUT,
          name: "A Completely Unrelated Bookstore",
          lat: 22.95,
          lng: 88.8,
        },
        sessionCookie,
      ),
    );
    expect(res.status).toBe(201);
  });
});
