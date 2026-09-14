import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";

/**
 * Exercises M5's actual DONE WHEN criteria end-to-end against a real
 * in-memory Mongo: "a rapid-fire new/unverified account gets auto-flagged
 * or rejected per the thresholds; a trusted contributor's clean submission
 * auto-publishes" — plus the submission cooldown and daily rate limit that
 * ride along with spam-score gating.
 */
let mongod: MongoMemoryServer;
let POST: typeof import("@/app/api/places/route").POST;
let signAccessToken: typeof import("@/lib/auth/jwt").signAccessToken;
let ACCESS_COOKIE: string;
let categoryId: ObjectId;

function postRequest(body: unknown, cookie?: string) {
  return new NextRequest("http://localhost/api/places", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}

const BASE_STATS = {
  placesAdded: 0,
  placesVerified: 0,
  correctionsMade: 0,
  reportsFiled: 0,
  usefulVotesReceived: 0,
  rejectedSubmissions: 0,
  spamReportsAgainst: 0,
};

async function makeUser(overrides: {
  username: string;
  emailVerified: boolean;
  createdAt: Date;
  reputationLevel?: "newcomer" | "local_explorer" | "community_scout" | "trusted_contributor" | "local_guide";
  submissionCooldownUntil?: Date | null;
}) {
  const { getUsersCollection } = await import("@/lib/db/models/user");
  const users = await getUsersCollection();
  const id = new ObjectId();
  await users.insertOne({
    _id: id,
    displayName: overrides.username,
    username: overrides.username,
    email: `${overrides.username}@example.com`,
    emailVerified: overrides.emailVerified,
    passwordHash: "irrelevant",
    roles: ["CONTRIBUTOR"],
    reputationLevel: overrides.reputationLevel ?? "newcomer",
    stats: BASE_STATS,
    accountStatus: "active",
    submissionCooldownUntil: overrides.submissionCooldownUntil,
    createdAt: overrides.createdAt,
    updatedAt: overrides.createdAt,
  });
  const token = await signAccessToken({
    sub: id.toHexString(),
    username: overrides.username,
    roles: ["CONTRIBUTOR"],
    emailVerified: overrides.emailVerified,
  });
  return { id, cookie: `${ACCESS_COOKIE}=${token}` };
}

let placeCounter = 0;
function uniquePlaceInput(overrides: Record<string, unknown> = {}) {
  placeCounter += 1;
  return {
    name: `Test Place ${placeCounter}`,
    categorySlug: "grocery-m5",
    district: "North 24 Parganas",
    locality: `Locality${placeCounter}`, // distinct locality per call — no cross-test duplicate/geo interference
    pincode: "743263",
    lat: 22 + placeCounter * 0.01,
    lng: 88 + placeCounter * 0.01,
    ...overrides,
  };
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  process.env.MONGODB_DB_NAME = "aaspaas_test";
  process.env.JWT_ACCESS_SECRET = "test-secret-do-not-use-in-real-life";

  ({ POST } = await import("@/app/api/places/route"));
  ({ signAccessToken } = await import("@/lib/auth/jwt"));
  ({ ACCESS_COOKIE } = await import("@/lib/auth/session"));

  const { getCategoriesCollection } = await import("@/lib/db/models/category");
  const categories = await getCategoriesCollection();
  categoryId = new ObjectId();
  await categories.insertOne({
    _id: categoryId,
    slug: "grocery-m5",
    name: "Grocery",
    icon: "shopping-basket",
    synonyms: ["grocery"],
  });
}, 60_000);

afterAll(async () => {
  await mongod?.stop();
});

describe("POST /api/places — spam-score gating (DONE WHEN scenarios)", () => {
  it("auto-publishes a clean submission from a trusted contributor", async () => {
    const { cookie } = await makeUser({
      username: "trusted1",
      emailVerified: true,
      createdAt: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000),
      reputationLevel: "trusted_contributor",
    });

    const res = await POST(postRequest(uniquePlaceInput(), cookie));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.status).toBe("published");
  });

  it("auto-publishes a clean submission from an established, verified newcomer", async () => {
    const { cookie } = await makeUser({
      username: "clean1",
      emailVerified: true,
      createdAt: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000),
    });

    const res = await POST(postRequest(uniquePlaceInput(), cookie));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.status).toBe("published");
  });

  it("flags a brand-new unverified account's rapid-fire spammy submission (rejected) and applies a cooldown", async () => {
    const { id, cookie } = await makeUser({ username: "spammer1", emailVerified: false, createdAt: new Date() });

    // Two prior submissions in the last 24h to trigger the velocity signal,
    // then a third (still within the restricted tier's 3/day cap) with
    // spammy content — matches spamScoring.test.ts's own "brand-new
    // unverified, rapid-fire, spammy" scenario.
    for (let i = 0; i < 2; i++) {
      await POST(postRequest(uniquePlaceInput({ acknowledgeDuplicates: true }), cookie));
    }
    const res = await POST(
      postRequest(
        uniquePlaceInput({
          name: "BEST DEALS EVER",
          description: "100% free gift, click here now! www.spam-example.com",
          acknowledgeDuplicates: true,
        }),
        cookie,
      ),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.status).toBe("rejected");

    const { getUsersCollection } = await import("@/lib/db/models/user");
    const users = await getUsersCollection();
    const user = await users.findOne({ _id: id });
    expect(user?.submissionCooldownUntil).toBeTruthy();
    expect(user!.submissionCooldownUntil!.getTime()).toBeGreaterThan(Date.now());
  });

  it("blocks further submissions while a cooldown is active", async () => {
    const { cookie } = await makeUser({
      username: "cooldown1",
      emailVerified: true,
      createdAt: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000),
      submissionCooldownUntil: new Date(Date.now() + 48 * 60 * 60 * 1000),
    });

    const res = await POST(postRequest(uniquePlaceInput(), cookie));
    expect(res.status).toBe(403);
  });

  it("stores the score and reasons on the place document for audit", async () => {
    const { cookie } = await makeUser({ username: "audit1", emailVerified: false, createdAt: new Date() });

    const res = await POST(postRequest(uniquePlaceInput({ acknowledgeDuplicates: true }), cookie));
    const body = await res.json();

    const { getPlacesCollection } = await import("@/lib/db/models/place");
    const places = await getPlacesCollection();
    const doc = await places.findOne({ _id: new ObjectId(body.id) });
    expect(doc?.spamScore).toBeGreaterThan(0);
    expect(doc?.spamReasons?.length).toBeGreaterThan(0);
  });
});

describe("POST /api/places — daily submission rate limit", () => {
  it("enforces the restricted tier's 3/day cap for an unverified, brand-new account", async () => {
    const { cookie } = await makeUser({ username: "capped1", emailVerified: false, createdAt: new Date() });

    for (let i = 0; i < 3; i++) {
      const res = await POST(postRequest(uniquePlaceInput({ acknowledgeDuplicates: true }), cookie));
      expect(res.status).toBe(201);
    }
    const fourth = await POST(postRequest(uniquePlaceInput({ acknowledgeDuplicates: true }), cookie));
    expect(fourth.status).toBe(429);
  });

  it("gives a verified, established account the standard 10/day cap, not the restricted 3/day one", async () => {
    const { cookie } = await makeUser({
      username: "standard1",
      emailVerified: true,
      createdAt: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000),
    });

    for (let i = 0; i < 4; i++) {
      const res = await POST(postRequest(uniquePlaceInput(), cookie));
      expect(res.status).toBe(201); // would 429 by the 4th submission under the restricted tier
    }
  });
});
