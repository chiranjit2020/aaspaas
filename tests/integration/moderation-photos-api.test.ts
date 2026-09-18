import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";

/** Exercises the photo moderation routes — same atomic double-decide guard as places/edits. */
let mongod: MongoMemoryServer;
let approvePOST: typeof import("@/app/api/moderation/photos/[id]/approve/route").POST;
let rejectPOST: typeof import("@/app/api/moderation/photos/[id]/reject/route").POST;
let signAccessToken: typeof import("@/lib/auth/jwt").signAccessToken;
let ACCESS_COOKIE: string;

let moderatorId: ObjectId;
let moderatorCookie: string;
let contributorId: ObjectId;
let contributorCookie: string;
let placeId: ObjectId;

function cookieRequest(url: string, cookie?: string) {
  return new NextRequest(url, { method: "POST", headers: cookie ? { cookie } : undefined });
}

async function insertPendingPhoto() {
  const { getPlacePhotosCollection } = await import("@/lib/db/models/placePhoto");
  const photos = await getPlacePhotosCollection();
  const doc = {
    _id: new ObjectId(),
    placeId,
    url: "https://res.cloudinary.com/test/pending.jpg",
    uploadedBy: contributorId,
    uploadedAt: new Date(),
    moderationStatus: "pending" as const,
  };
  await photos.insertOne(doc);
  return doc._id;
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  process.env.MONGODB_DB_NAME = "aaspaas_test";
  process.env.JWT_ACCESS_SECRET = "test-secret-do-not-use-in-real-life";

  ({ POST: approvePOST } = await import("@/app/api/moderation/photos/[id]/approve/route"));
  ({ POST: rejectPOST } = await import("@/app/api/moderation/photos/[id]/reject/route"));
  ({ signAccessToken } = await import("@/lib/auth/jwt"));
  ({ ACCESS_COOKIE } = await import("@/lib/auth/session"));

  const { getCategoriesCollection } = await import("@/lib/db/models/category");
  const { getUsersCollection } = await import("@/lib/db/models/user");
  const { getPlacesCollection } = await import("@/lib/db/models/place");

  const categoryId = new ObjectId();
  const categories = await getCategoriesCollection();
  await categories.insertOne({
    _id: categoryId,
    slug: "bakery",
    name: "Bakery",
    icon: "cake",
    synonyms: ["bakery"],
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

  moderatorId = new ObjectId();
  await users.insertOne({ ...baseUser, _id: moderatorId, username: "photomod", roles: ["MODERATOR"] });
  moderatorCookie = `${ACCESS_COOKIE}=${await signAccessToken({
    sub: moderatorId.toHexString(),
    username: "photomod",
    roles: ["MODERATOR"],
    emailVerified: true,
  })}`;

  contributorId = new ObjectId();
  await users.insertOne({ ...baseUser, _id: contributorId, username: "photouser", roles: ["CONTRIBUTOR"] });
  contributorCookie = `${ACCESS_COOKIE}=${await signAccessToken({
    sub: contributorId.toHexString(),
    username: "photouser",
    roles: ["CONTRIBUTOR"],
    emailVerified: true,
  })}`;

  const places = await getPlacesCollection();
  placeId = new ObjectId();
  const now = new Date();
  await places.insertOne({
    _id: placeId,
    name: "Photo Moderation Bakery",
    slug: "photo-moderation-bakery",
    categoryId,
    district: "North 24 Parganas",
    locality: "Habra",
    pincode: "743263",
    location: { type: "Point", coordinates: [88.69, 22.84] },
    createdBy: contributorId,
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

describe("POST /api/moderation/photos/[id]/approve", () => {
  it("403s a non-moderator", async () => {
    const id = await insertPendingPhoto();
    const res = await approvePOST(
      cookieRequest(`http://localhost/api/moderation/photos/${id}/approve`, contributorCookie),
      { params: Promise.resolve({ id: id.toHexString() }) },
    );
    expect(res.status).toBe(403);
  });

  it("approves the photo and logs a moderation_actions entry", async () => {
    const id = await insertPendingPhoto();
    const res = await approvePOST(
      cookieRequest(`http://localhost/api/moderation/photos/${id}/approve`, moderatorCookie),
      { params: Promise.resolve({ id: id.toHexString() }) },
    );
    expect(res.status).toBe(200);

    const { getPlacePhotosCollection } = await import("@/lib/db/models/placePhoto");
    const photos = await getPlacePhotosCollection();
    const doc = await photos.findOne({ _id: id });
    expect(doc?.moderationStatus).toBe("approved");

    const { getModerationActionsCollection } = await import("@/lib/db/models/moderationAction");
    const actions = await getModerationActionsCollection();
    const action = await actions.findOne({ targetId: id, action: "approve_photo" });
    expect(action?.actorId.equals(moderatorId)).toBe(true);
    expect(action?.targetType).toBe("place_photo");
  });

  it("404s a photo that's already been decided", async () => {
    const id = await insertPendingPhoto();
    await approvePOST(cookieRequest(`http://localhost/api/moderation/photos/${id}/approve`, moderatorCookie), {
      params: Promise.resolve({ id: id.toHexString() }),
    });
    const second = await approvePOST(
      cookieRequest(`http://localhost/api/moderation/photos/${id}/approve`, moderatorCookie),
      { params: Promise.resolve({ id: id.toHexString() }) },
    );
    expect(second.status).toBe(404);
  });
});

describe("POST /api/moderation/photos/[id]/reject", () => {
  it("rejects the photo and keeps it off the public gallery", async () => {
    const id = await insertPendingPhoto();
    const res = await rejectPOST(
      cookieRequest(`http://localhost/api/moderation/photos/${id}/reject`, moderatorCookie),
      { params: Promise.resolve({ id: id.toHexString() }) },
    );
    expect(res.status).toBe(200);

    const { getApprovedPhotos } = await import("@/lib/places/getApprovedPhotos");
    const approved = await getApprovedPhotos(placeId.toHexString());
    expect(approved.find((p) => p.id === id.toHexString())).toBeUndefined();

    const { getPlacePhotosCollection } = await import("@/lib/db/models/placePhoto");
    const photos = await getPlacePhotosCollection();
    const doc = await photos.findOne({ _id: id });
    expect(doc?.moderationStatus).toBe("rejected");
  });
});
