import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";

/** Exercises POST /api/places/[id]/useful against a real in-memory Mongo. */
let mongod: MongoMemoryServer;
let POST: typeof import("@/app/api/places/[id]/useful/route").POST;
let signAccessToken: typeof import("@/lib/auth/jwt").signAccessToken;
let ACCESS_COOKIE: string;
let categoryId: ObjectId;
let ownerId: ObjectId;
let voterId: ObjectId;
let voterCookie: string;
let ownerCookie: string;
let unverifiedVoterId: ObjectId;
let unverifiedVoterCookie: string;

function voteRequest(body: unknown, cookie?: string) {
  return new NextRequest("http://localhost/api/places/x/useful", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}

async function insertPublishedPlace(name: string) {
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
    createdBy: ownerId,
    ownerId: null,
    status: "published" as const,
    spamScore: 0,
    verificationCount: 0,
    usefulCount: 0,
    notUsefulCount: 0,
    duplicateOfPlaceId: null,
    tier: "free" as const,
    createdAt: now,
    updatedAt: now,
  };
  await places.insertOne(doc);
  return doc._id;
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  process.env.MONGODB_DB_NAME = "aaspaas_test";
  process.env.JWT_ACCESS_SECRET = "test-secret-do-not-use-in-real-life";

  ({ POST } = await import("@/app/api/places/[id]/useful/route"));
  ({ signAccessToken } = await import("@/lib/auth/jwt"));
  ({ ACCESS_COOKIE } = await import("@/lib/auth/session"));
  const { getCategoriesCollection } = await import("@/lib/db/models/category");
  const { getUsersCollection } = await import("@/lib/db/models/user");

  const categories = await getCategoriesCollection();
  categoryId = new ObjectId();
  await categories.insertOne({
    _id: categoryId,
    slug: "pharmacy",
    name: "Pharmacy",
    icon: "pill",
    synonyms: ["pharmacy", "medicine shop"],
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

  ownerId = new ObjectId();
  await users.insertOne({ ...baseUser, _id: ownerId, username: "pharmacyowner", roles: ["CONTRIBUTOR"] });
  const ownerToken = await signAccessToken({
    sub: ownerId.toHexString(),
    username: "pharmacyowner",
    roles: ["CONTRIBUTOR"],
    emailVerified: true,
  });
  ownerCookie = `${ACCESS_COOKIE}=${ownerToken}`;

  voterId = new ObjectId();
  await users.insertOne({ ...baseUser, _id: voterId, username: "voteruser", roles: ["CONTRIBUTOR"] });
  const voterToken = await signAccessToken({
    sub: voterId.toHexString(),
    username: "voteruser",
    roles: ["CONTRIBUTOR"],
    emailVerified: true,
  });
  voterCookie = `${ACCESS_COOKIE}=${voterToken}`;

  unverifiedVoterId = new ObjectId();
  await users.insertOne({
    ...baseUser,
    _id: unverifiedVoterId,
    username: "unverifiedvoter",
    roles: ["CONTRIBUTOR"],
    emailVerified: false,
  });
  const unverifiedToken = await signAccessToken({
    sub: unverifiedVoterId.toHexString(),
    username: "unverifiedvoter",
    roles: ["CONTRIBUTOR"],
    emailVerified: false,
  });
  unverifiedVoterCookie = `${ACCESS_COOKIE}=${unverifiedToken}`;
}, 60_000);

afterAll(async () => {
  await mongod?.stop();
});

describe("POST /api/places/[id]/useful — guards", () => {
  it("rejects an unauthenticated vote", async () => {
    const placeId = await insertPublishedPlace("Guard Pharmacy 1");
    const res = await POST(voteRequest({ value: "useful" }), {
      params: Promise.resolve({ id: placeId.toHexString() }),
    });
    expect(res.status).toBe(401);
  });

  it("rejects an invalid vote value", async () => {
    const placeId = await insertPublishedPlace("Guard Pharmacy 2");
    const res = await POST(voteRequest({ value: "amazing" }, voterCookie), {
      params: Promise.resolve({ id: placeId.toHexString() }),
    });
    expect(res.status).toBe(400);
  });

  it("404s a place that doesn't exist", async () => {
    const res = await POST(voteRequest({ value: "useful" }, voterCookie), {
      params: Promise.resolve({ id: new ObjectId().toHexString() }),
    });
    expect(res.status).toBe(404);
  });

  it("blocks voting on your own submission", async () => {
    const placeId = await insertPublishedPlace("Guard Pharmacy 3");
    const res = await POST(voteRequest({ value: "useful" }, ownerCookie), {
      params: Promise.resolve({ id: placeId.toHexString() }),
    });
    expect(res.status).toBe(403);
  });

  it("blocks a vote from an unverified account — §2's sockpuppet mitigation", async () => {
    const placeId = await insertPublishedPlace("Guard Pharmacy 4");
    const res = await POST(voteRequest({ value: "useful" }, unverifiedVoterCookie), {
      params: Promise.resolve({ id: placeId.toHexString() }),
    });
    expect(res.status).toBe(403);

    const { getUsefulVotesCollection } = await import("@/lib/db/models/usefulVote");
    const votes = await getUsefulVotesCollection();
    const vote = await votes.findOne({ placeId, userId: unverifiedVoterId });
    expect(vote).toBeNull();
  });
});

describe("POST /api/places/[id]/useful — vote lifecycle", () => {
  it("casts a fresh useful vote and credits the owner's usefulVotesReceived", async () => {
    const placeId = await insertPublishedPlace("Lifecycle Pharmacy 1");
    const res = await POST(voteRequest({ value: "useful" }, voterCookie), {
      params: Promise.resolve({ id: placeId.toHexString() }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ yourVote: "useful", usefulCount: 1, notUsefulCount: 0 });

    const { getUsersCollection } = await import("@/lib/db/models/user");
    const users = await getUsersCollection();
    const owner = await users.findOne({ _id: ownerId });
    expect(owner?.stats.usefulVotesReceived).toBeGreaterThan(0);
  });

  it("toggles the vote off when cast again with the same value", async () => {
    const placeId = await insertPublishedPlace("Lifecycle Pharmacy 2");
    await POST(voteRequest({ value: "useful" }, voterCookie), {
      params: Promise.resolve({ id: placeId.toHexString() }),
    });
    const res = await POST(voteRequest({ value: "useful" }, voterCookie), {
      params: Promise.resolve({ id: placeId.toHexString() }),
    });
    const body = await res.json();
    expect(body).toEqual({ yourVote: null, usefulCount: 0, notUsefulCount: 0 });

    const { getUsefulVotesCollection } = await import("@/lib/db/models/usefulVote");
    const votes = await getUsefulVotesCollection();
    const vote = await votes.findOne({ placeId, userId: voterId });
    expect(vote).toBeNull();
  });

  it("switches from not_useful to useful, moving both counters", async () => {
    const placeId = await insertPublishedPlace("Lifecycle Pharmacy 3");
    await POST(voteRequest({ value: "not_useful" }, voterCookie), {
      params: Promise.resolve({ id: placeId.toHexString() }),
    });
    const res = await POST(voteRequest({ value: "useful" }, voterCookie), {
      params: Promise.resolve({ id: placeId.toHexString() }),
    });
    const body = await res.json();
    expect(body).toEqual({ yourVote: "useful", usefulCount: 1, notUsefulCount: 0 });
  });

  it("enforces one vote row per (place, user) even across switches", async () => {
    const placeId = await insertPublishedPlace("Lifecycle Pharmacy 4");
    await POST(voteRequest({ value: "not_useful" }, voterCookie), {
      params: Promise.resolve({ id: placeId.toHexString() }),
    });
    await POST(voteRequest({ value: "useful" }, voterCookie), {
      params: Promise.resolve({ id: placeId.toHexString() }),
    });

    const { getUsefulVotesCollection } = await import("@/lib/db/models/usefulVote");
    const votes = await getUsefulVotesCollection();
    const count = await votes.countDocuments({ placeId, userId: voterId });
    expect(count).toBe(1);
  });
});
