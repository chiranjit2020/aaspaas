import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";

/** §2.1's daily caps on votes and reports, plus the 60/min anonymous read cap. */
let mongod: MongoMemoryServer;
let voteRoutePOST: typeof import("@/app/api/places/[id]/useful/route").POST;
let reportRoutePOST: typeof import("@/app/api/places/[id]/report/route").POST;
let searchGET: typeof import("@/app/api/search/route").GET;
let signAccessToken: typeof import("@/lib/auth/jwt").signAccessToken;
let ACCESS_COOKIE: string;
let placeId: ObjectId;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  process.env.MONGODB_DB_NAME = "aaspaas_test";
  process.env.JWT_ACCESS_SECRET = "test-secret-do-not-use-in-real-life";

  ({ POST: voteRoutePOST } = await import("@/app/api/places/[id]/useful/route"));
  ({ POST: reportRoutePOST } = await import("@/app/api/places/[id]/report/route"));
  ({ GET: searchGET } = await import("@/app/api/search/route"));
  ({ signAccessToken } = await import("@/lib/auth/jwt"));
  ({ ACCESS_COOKIE } = await import("@/lib/auth/session"));

  const { getCategoriesCollection } = await import("@/lib/db/models/category");
  const categories = await getCategoriesCollection();
  const categoryId = new ObjectId();
  await categories.insertOne({
    _id: categoryId,
    slug: "stationery-m5",
    name: "Stationery",
    icon: "pencil",
    synonyms: ["stationery"],
  });

  const { getUsersCollection } = await import("@/lib/db/models/user");
  const users = await getUsersCollection();
  const ownerId = new ObjectId();
  await users.insertOne({
    _id: ownerId,
    displayName: "Owner",
    username: "rl-owner",
    email: "rl-owner@example.com",
    emailVerified: true,
    passwordHash: "irrelevant",
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

  const { getPlacesCollection } = await import("@/lib/db/models/place");
  const places = await getPlacesCollection();
  placeId = new ObjectId();
  const now = new Date();
  await places.insertOne({
    _id: placeId,
    name: "Rate Limit Test Shop",
    slug: "rate-limit-test-shop",
    categoryId,
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

async function makeVoter(username: string) {
  const { getUsersCollection } = await import("@/lib/db/models/user");
  const users = await getUsersCollection();
  const id = new ObjectId();
  await users.insertOne({
    _id: id,
    displayName: username,
    username,
    email: `${username}@example.com`,
    emailVerified: true,
    passwordHash: "irrelevant",
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
    sub: id.toHexString(),
    username,
    roles: ["CONTRIBUTOR"],
    emailVerified: true,
  });
  return `${ACCESS_COOKIE}=${token}`;
}

function voteRequest(cookie: string, value: string) {
  return new NextRequest("http://localhost/api/places/x/useful", {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ value }),
  });
}

function reportRequest(cookie: string, details: string) {
  return new NextRequest("http://localhost/api/places/x/report", {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ reason: "other", details }),
  });
}

describe("POST /api/places/[id]/useful — 20/day rate limit", () => {
  it("blocks the 21st vote-affecting call in a day", async () => {
    const cookie = await makeVoter("rl-voter");
    // Alternate useful/not_useful so every call is a real insert/update, not
    // a same-value toggle-off that the transition logic would treat as a
    // no-op state change — each call should still count against the limit.
    for (let i = 0; i < 20; i++) {
      const res = await voteRoutePOST(voteRequest(cookie, i % 2 === 0 ? "useful" : "not_useful"), {
        params: Promise.resolve({ id: placeId.toHexString() }),
      });
      expect(res.status).toBe(200);
    }
    const res21 = await voteRoutePOST(voteRequest(cookie, "useful"), {
      params: Promise.resolve({ id: placeId.toHexString() }),
    });
    expect(res21.status).toBe(429);
  });
});

describe("POST /api/places/[id]/report — 5/day rate limit", () => {
  it("blocks the 6th report in a day", async () => {
    const cookie = await makeVoter("rl-reporter");
    for (let i = 0; i < 5; i++) {
      const res = await reportRoutePOST(reportRequest(cookie, `issue ${i}`), {
        params: Promise.resolve({ id: placeId.toHexString() }),
      });
      expect(res.status).toBe(201);
    }
    const sixth = await reportRoutePOST(reportRequest(cookie, "issue 6"), {
      params: Promise.resolve({ id: placeId.toHexString() }),
    });
    expect(sixth.status).toBe(429);
  });
});

describe("GET /api/search — 60/min anonymous read rate limit", () => {
  it("blocks the 61st request from the same IP within a minute", async () => {
    const headers = { "x-forwarded-for": "203.0.113.5" };
    for (let i = 0; i < 60; i++) {
      // No `q` — a plain browse, so this doesn't need the $text index that
      // createIndexes.ts sets up on a real database but this in-memory test
      // DB never runs.
      const res = await searchGET(new NextRequest("http://localhost/api/search?locality=Habra", { headers }));
      expect(res.status).toBe(200);
    }
    const res61 = await searchGET(new NextRequest("http://localhost/api/search?locality=Habra", { headers }));
    expect(res61.status).toBe(429);
  });

  it("does not rate-limit a different IP", async () => {
    const res = await searchGET(
      new NextRequest("http://localhost/api/search?locality=Habra", {
        headers: { "x-forwarded-for": "203.0.113.99" },
      }),
    );
    expect(res.status).toBe(200);
  });
});
