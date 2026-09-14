import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";

/** M5's spam-score gating applied to PATCH /api/places/[id] (edit proposals). */
let mongod: MongoMemoryServer;
let PATCH: typeof import("@/app/api/places/[id]/route").PATCH;
let signAccessToken: typeof import("@/lib/auth/jwt").signAccessToken;
let ACCESS_COOKIE: string;
let categoryId: ObjectId;
let placeId: ObjectId;

function patchRequest(body: unknown, cookie?: string) {
  return new NextRequest("http://localhost/api/places/x", {
    method: "PATCH",
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
    reputationLevel: "newcomer",
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

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  process.env.MONGODB_DB_NAME = "aaspaas_test";
  process.env.JWT_ACCESS_SECRET = "test-secret-do-not-use-in-real-life";

  ({ PATCH } = await import("@/app/api/places/[id]/route"));
  ({ signAccessToken } = await import("@/lib/auth/jwt"));
  ({ ACCESS_COOKIE } = await import("@/lib/auth/session"));

  const { getCategoriesCollection } = await import("@/lib/db/models/category");
  const categories = await getCategoriesCollection();
  categoryId = new ObjectId();
  await categories.insertOne({
    _id: categoryId,
    slug: "hardware-m5",
    name: "Hardware",
    icon: "hammer",
    synonyms: ["hardware"],
  });

  const { getPlacesCollection } = await import("@/lib/db/models/place");
  const places = await getPlacesCollection();
  placeId = new ObjectId();
  const now = new Date();
  await places.insertOne({
    _id: placeId,
    name: "Test Hardware Store",
    slug: "test-hardware-store",
    categoryId,
    phone: "9830000000",
    description: "Nuts, bolts, and everything in between.",
    district: "North 24 Parganas",
    locality: "Habra",
    pincode: "743263",
    location: { type: "Point", coordinates: [88.69, 22.84] },
    createdBy: null,
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

describe("PATCH /api/places/[id] — spam-score gating on edits", () => {
  it("blocks a proposal while the account is under a submission cooldown", async () => {
    const { cookie } = await makeUser({
      username: "cooldowneditor",
      emailVerified: true,
      createdAt: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000),
      submissionCooldownUntil: new Date(Date.now() + 48 * 60 * 60 * 1000),
    });

    const res = await PATCH(patchRequest({ phone: "9831111111" }, cookie), {
      params: Promise.resolve({ id: placeId.toHexString() }),
    });
    expect(res.status).toBe(403);
  });

  it("auto-rejects a spammy edit from a brand-new unverified account and applies a cooldown", async () => {
    const { id, cookie } = await makeUser({ username: "spammyeditor", emailVerified: false, createdAt: new Date() });

    const res = await PATCH(
      patchRequest(
        {
          name: "BEST HARDWARE DEALS",
          description: "100% free gift, click here now! Call 9999999999. www.spam-example.com",
        },
        cookie,
      ),
      { params: Promise.resolve({ id: placeId.toHexString() }) },
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.status).toBe("rejected");

    const { getPlacesCollection } = await import("@/lib/db/models/place");
    const places = await getPlacesCollection();
    const place = await places.findOne({ _id: placeId });
    expect(place?.name).toBe("Test Hardware Store"); // unchanged
    expect(place?.description).toBe("Nuts, bolts, and everything in between."); // unchanged

    const { getUsersCollection } = await import("@/lib/db/models/user");
    const users = await getUsersCollection();
    const user = await users.findOne({ _id: id });
    expect(user?.submissionCooldownUntil).toBeTruthy();
  });

  it("enforces the 10/day edit rate limit", async () => {
    const { cookie } = await makeUser({
      username: "editspammer",
      emailVerified: true,
      createdAt: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000),
    });

    for (let i = 0; i < 10; i++) {
      const res = await PATCH(patchRequest({ phone: `9831100${String(i).padStart(3, "0")}` }, cookie), {
        params: Promise.resolve({ id: placeId.toHexString() }),
      });
      expect(res.status).toBe(201);
    }
    const eleventh = await PATCH(patchRequest({ phone: "9830009999" }, cookie), {
      params: Promise.resolve({ id: placeId.toHexString() }),
    });
    expect(eleventh.status).toBe(429);
  });
});
