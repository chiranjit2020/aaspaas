import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { ObjectId } from "mongodb";

/**
 * GET /api/users/[username] is the one place in the codebase explicitly
 * allowed to leak nothing about a user — no email, no passwordHash, no
 * roles. Worth a real test, not just a code-review claim, per review.md's
 * Part 20 security baseline ("no email exposure in public contributor
 * profiles").
 *
 * Also verifies placesAddedCount is a live count of *published* places, not
 * the stats.placesAdded submission counter — a pending place must not
 * inflate the public "accomplishment" number.
 */
let mongod: MongoMemoryServer;
let GET: typeof import("@/app/api/users/[username]/route").GET;
let userId: ObjectId;
let categoryId: ObjectId;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  process.env.MONGODB_DB_NAME = "aaspaas_test";

  ({ GET } = await import("@/app/api/users/[username]/route"));
  const { getUsersCollection } = await import("@/lib/db/models/user");
  const { getCategoriesCollection } = await import("@/lib/db/models/category");
  const { getPlacesCollection } = await import("@/lib/db/models/place");

  const users = await getUsersCollection();
  userId = new ObjectId();
  await users.insertOne({
    _id: userId,
    displayName: "Priya Sharma",
    username: "priya_habra",
    email: "priya@example.com",
    emailVerified: true,
    passwordHash: "super-secret-hash",
    roles: ["CONTRIBUTOR"],
    locality: "Habra",
    district: "North 24 Parganas",
    reputationLevel: "newcomer",
    stats: {
      placesAdded: 2,
      placesVerified: 0,
      correctionsMade: 0,
      reportsFiled: 0,
      usefulVotesReceived: 0,
      rejectedSubmissions: 0,
      spamReportsAgainst: 0,
    },
    accountStatus: "active",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date(),
  });

  const categories = await getCategoriesCollection();
  categoryId = new ObjectId();
  await categories.insertOne({
    _id: categoryId,
    slug: "bakery",
    name: "Bakery",
    icon: "croissant",
    synonyms: ["bakery"],
  });

  const places = await getPlacesCollection();
  const now = new Date();
  await places.insertMany([
    {
      _id: new ObjectId(),
      name: "Published Bakery",
      slug: "published-bakery",
      categoryId,
      district: "North 24 Parganas",
      locality: "Habra",
      pincode: "743263",
      location: { type: "Point", coordinates: [88.69, 22.84] },
      createdBy: userId,
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
    },
    {
      _id: new ObjectId(),
      name: "Pending Bakery",
      slug: "pending-bakery",
      categoryId,
      district: "North 24 Parganas",
      locality: "Habra",
      pincode: "743263",
      location: { type: "Point", coordinates: [88.69, 22.84] },
      createdBy: userId,
      ownerId: null,
      status: "pending", // submitted but not yet moderated
      spamScore: 0,
      verificationCount: 0,
      usefulCount: 0,
      notUsefulCount: 0,
      duplicateOfPlaceId: null,
      tier: "free",
      createdAt: now,
      updatedAt: now,
    },
  ]);
}, 60_000);

afterAll(async () => {
  await mongod?.stop();
});

function getRequest(username: string) {
  return GET(new Request(`http://localhost/api/users/${username}`), {
    params: Promise.resolve({ username }),
  });
}

describe("GET /api/users/[username]", () => {
  it("404s for a username that doesn't exist", async () => {
    const res = await getRequest("nobody-here");
    expect(res.status).toBe(404);
  });

  it("returns the public profile shape and nothing else", async () => {
    const res = await getRequest("priya_habra");
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body).toMatchObject({
      displayName: "Priya Sharma",
      username: "priya_habra",
      locality: "Habra",
      district: "North 24 Parganas",
    });

    for (const forbiddenKey of ["email", "passwordHash", "roles", "emailVerified", "accountStatus", "stats"]) {
      expect(body).not.toHaveProperty(forbiddenKey);
    }
  });

  it("counts only published places, not pending submissions", async () => {
    const res = await getRequest("priya_habra");
    const body = await res.json();
    // stats.placesAdded (the submission counter) is 2 in the seeded doc;
    // the public count must reflect only the 1 published place.
    expect(body.placesAddedCount).toBe(1);
  });

  it("is case-insensitive on username lookup", async () => {
    const res = await getRequest("Priya_Habra");
    expect(res.status).toBe(200);
  });
});
