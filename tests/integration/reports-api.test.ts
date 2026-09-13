import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";

/** Exercises POST /api/places/[id]/report against a real in-memory Mongo. */
let mongod: MongoMemoryServer;
let POST: typeof import("@/app/api/places/[id]/report/route").POST;
let signAccessToken: typeof import("@/lib/auth/jwt").signAccessToken;
let ACCESS_COOKIE: string;
let categoryId: ObjectId;
let placeId: ObjectId;
let reporterId: ObjectId;
let sessionCookie: string;

function reportRequest(body: unknown, cookie?: string) {
  return new NextRequest("http://localhost/api/places/x/report", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  process.env.MONGODB_DB_NAME = "aaspaas_test";
  process.env.JWT_ACCESS_SECRET = "test-secret-do-not-use-in-real-life";

  ({ POST } = await import("@/app/api/places/[id]/report/route"));
  ({ signAccessToken } = await import("@/lib/auth/jwt"));
  ({ ACCESS_COOKIE } = await import("@/lib/auth/session"));
  const { getCategoriesCollection } = await import("@/lib/db/models/category");
  const { getUsersCollection } = await import("@/lib/db/models/user");
  const { getPlacesCollection } = await import("@/lib/db/models/place");

  const categories = await getCategoriesCollection();
  categoryId = new ObjectId();
  await categories.insertOne({
    _id: categoryId,
    slug: "grocery",
    name: "Grocery",
    icon: "shopping-basket",
    synonyms: ["grocery"],
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
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const ownerId = new ObjectId();
  await users.insertOne({ ...baseUser, _id: ownerId, username: "groceryowner", roles: ["CONTRIBUTOR"] });

  reporterId = new ObjectId();
  await users.insertOne({ ...baseUser, _id: reporterId, username: "reporteruser", roles: ["CONTRIBUTOR"] });
  const token = await signAccessToken({
    sub: reporterId.toHexString(),
    username: "reporteruser",
    roles: ["CONTRIBUTOR"],
    emailVerified: true,
  });
  sessionCookie = `${ACCESS_COOKIE}=${token}`;

  const places = await getPlacesCollection();
  placeId = new ObjectId();
  const now = new Date();
  await places.insertOne({
    _id: placeId,
    name: "Test Grocery Store",
    slug: "test-grocery-store",
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

describe("POST /api/places/[id]/report", () => {
  it("rejects an unauthenticated report", async () => {
    const res = await POST(reportRequest({ reason: "wrong_info" }), {
      params: Promise.resolve({ id: placeId.toHexString() }),
    });
    expect(res.status).toBe(401);
  });

  it("rejects an invalid reason", async () => {
    const res = await POST(reportRequest({ reason: "not_a_real_reason" }, sessionCookie), {
      params: Promise.resolve({ id: placeId.toHexString() }),
    });
    expect(res.status).toBe(400);
  });

  it("404s a place that doesn't exist", async () => {
    const res = await POST(reportRequest({ reason: "spam" }, sessionCookie), {
      params: Promise.resolve({ id: new ObjectId().toHexString() }),
    });
    expect(res.status).toBe(404);
  });

  it("files the report and credits the reporter's reportsFiled stat", async () => {
    const res = await POST(
      reportRequest({ reason: "closed", details: "shutter down for months" }, sessionCookie),
      { params: Promise.resolve({ id: placeId.toHexString() }) },
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.status).toBe("open");

    const { getReportsCollection } = await import("@/lib/db/models/report");
    const reports = await getReportsCollection();
    const report = await reports.findOne({ _id: new ObjectId(body.id) });
    expect(report?.userId.equals(reporterId)).toBe(true);
    expect(report?.reason).toBe("closed");

    const { getUsersCollection } = await import("@/lib/db/models/user");
    const users = await getUsersCollection();
    const reporter = await users.findOne({ _id: reporterId });
    expect(reporter?.stats.reportsFiled).toBeGreaterThan(0);
  });
});
