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
    createdAt: new Date(),
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
  it("derives createdBy from the session, sets status pending", async () => {
    const res = await POST(postRequest(PLACE_INPUT, sessionCookie));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.status).toBe("pending");

    const { getPlacesCollection } = await import("@/lib/db/models/place");
    const places = await getPlacesCollection();
    const doc = await places.findOne({ _id: new ObjectId(body.id) });
    expect(doc?.createdBy?.equals(userId)).toBe(true);
    expect(doc?.status).toBe("pending");
  });

  it("ignores a client-supplied createdBy — the session always wins", async () => {
    const spoofedId = new ObjectId().toHexString();
    const res = await POST(
      postRequest({ ...PLACE_INPUT, name: "Spoof Attempt Shop", createdBy: spoofedId }, sessionCookie),
    );
    expect(res.status).toBe(201);
    const body = await res.json();

    const { getPlacesCollection } = await import("@/lib/db/models/place");
    const places = await getPlacesCollection();
    const doc = await places.findOne({ _id: new ObjectId(body.id) });
    expect(doc?.createdBy?.equals(userId)).toBe(true);
    expect(doc?.createdBy?.toHexString()).not.toBe(spoofedId);
  });

  it("keeps a pending submission out of public browse/search", async () => {
    const res = await POST(
      postRequest({ ...PLACE_INPUT, name: "Should Stay Hidden Shop" }, sessionCookie),
    );
    expect(res.status).toBe(201);

    const listRes = await GET(
      new NextRequest("http://localhost/api/places?locality=Habra&limit=50"),
    );
    const list = await listRes.json();
    expect(list.items.some((p: { name: string }) => p.name === "Should Stay Hidden Shop")).toBe(
      false,
    );
  });
});
