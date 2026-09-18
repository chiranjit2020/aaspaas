import { describe, expect, it, beforeAll, afterAll, vi } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";
import sharp from "sharp";

/**
 * Exercises POST /api/places/[id]/photos against a real in-memory Mongo.
 * Cloudinary itself is mocked — this test verifies the route's own auth/
 * rate-limit/validation/moderation-status logic, not a third-party service.
 */
vi.mock("@/lib/storage/upload", () => ({
  uploadPlacePhoto: vi.fn(async () => ({ url: "https://res.cloudinary.com/test/fake.jpg" })),
}));

let mongod: MongoMemoryServer;
let POST: typeof import("@/app/api/places/[id]/photos/route").POST;
let signAccessToken: typeof import("@/lib/auth/jwt").signAccessToken;
let ACCESS_COOKIE: string;
let categoryId: ObjectId;
let placeId: ObjectId;
let uploaderId: ObjectId;
let sessionCookie: string;
let unverifiedCookie: string;

async function pngFile(name = "photo.png"): Promise<File> {
  const buffer = await sharp({
    create: { width: 4, height: 4, channels: 3, background: { r: 10, g: 20, b: 30 } },
  })
    .png()
    .toBuffer();
  return new File([new Uint8Array(buffer)], name, { type: "image/png" });
}

function photoRequest(file: File | null, cookie?: string) {
  const form = new FormData();
  if (file) form.set("file", file);
  return new NextRequest("http://localhost/api/places/x/photos", {
    method: "POST",
    headers: cookie ? { cookie } : undefined,
    body: form,
  });
}

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

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  process.env.MONGODB_DB_NAME = "aaspaas_test";
  process.env.JWT_ACCESS_SECRET = "test-secret-do-not-use-in-real-life";

  ({ POST } = await import("@/app/api/places/[id]/photos/route"));
  ({ signAccessToken } = await import("@/lib/auth/jwt"));
  ({ ACCESS_COOKIE } = await import("@/lib/auth/session"));
  const { getCategoriesCollection } = await import("@/lib/db/models/category");
  const { getUsersCollection } = await import("@/lib/db/models/user");
  const { getPlacesCollection } = await import("@/lib/db/models/place");

  const categories = await getCategoriesCollection();
  categoryId = new ObjectId();
  await categories.insertOne({
    _id: categoryId,
    slug: "bakery",
    name: "Bakery",
    icon: "cake",
    synonyms: ["bakery"],
  });

  const users = await getUsersCollection();
  uploaderId = new ObjectId();
  await users.insertOne({ ...baseUser, _id: uploaderId, username: "photouploader", roles: ["CONTRIBUTOR"] });
  const token = await signAccessToken({
    sub: uploaderId.toHexString(),
    username: "photouploader",
    roles: ["CONTRIBUTOR"],
    emailVerified: true,
  });
  sessionCookie = `${ACCESS_COOKIE}=${token}`;

  const unverifiedId = new ObjectId();
  await users.insertOne({
    ...baseUser,
    _id: unverifiedId,
    username: "unverifieduploader",
    roles: ["CONTRIBUTOR"],
    emailVerified: false,
  });
  const unverifiedToken = await signAccessToken({
    sub: unverifiedId.toHexString(),
    username: "unverifieduploader",
    roles: ["CONTRIBUTOR"],
    emailVerified: false,
  });
  unverifiedCookie = `${ACCESS_COOKIE}=${unverifiedToken}`;

  const places = await getPlacesCollection();
  placeId = new ObjectId();
  const now = new Date();
  await places.insertOne({
    _id: placeId,
    name: "Test Bakery",
    slug: "test-bakery",
    categoryId,
    district: "North 24 Parganas",
    locality: "Habra",
    pincode: "743263",
    location: { type: "Point", coordinates: [88.69, 22.84] },
    createdBy: uploaderId,
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

describe("POST /api/places/[id]/photos", () => {
  it("rejects an unauthenticated upload", async () => {
    const file = await pngFile();
    const res = await POST(photoRequest(file), { params: Promise.resolve({ id: placeId.toHexString() }) });
    expect(res.status).toBe(401);
  });

  it("blocks an unverified account", async () => {
    const file = await pngFile();
    const res = await POST(photoRequest(file, unverifiedCookie), {
      params: Promise.resolve({ id: placeId.toHexString() }),
    });
    expect(res.status).toBe(403);
  });

  it("404s a place that doesn't exist", async () => {
    const file = await pngFile();
    const res = await POST(photoRequest(file, sessionCookie), {
      params: Promise.resolve({ id: new ObjectId().toHexString() }),
    });
    expect(res.status).toBe(404);
  });

  it("400s when no file is attached", async () => {
    const res = await POST(photoRequest(null, sessionCookie), {
      params: Promise.resolve({ id: placeId.toHexString() }),
    });
    expect(res.status).toBe(400);
  });

  it("400s a non-image file, sniffed by content not extension", async () => {
    const fakeImage = new File([new Uint8Array([1, 2, 3, 4])], "photo.png", { type: "image/png" });
    const res = await POST(photoRequest(fakeImage, sessionCookie), {
      params: Promise.resolve({ id: placeId.toHexString() }),
    });
    expect(res.status).toBe(400);
  });

  it("uploads the photo as pending, awaiting moderator approval", async () => {
    const file = await pngFile();
    const res = await POST(photoRequest(file, sessionCookie), {
      params: Promise.resolve({ id: placeId.toHexString() }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.status).toBe("pending");

    const { getPlacePhotosCollection } = await import("@/lib/db/models/placePhoto");
    const photos = await getPlacePhotosCollection();
    const doc = await photos.findOne({ _id: new ObjectId(body.id) });
    expect(doc?.moderationStatus).toBe("pending");
    expect(doc?.uploadedBy.equals(uploaderId)).toBe(true);
    expect(doc?.url).toBe("https://res.cloudinary.com/test/fake.jpg");
  });

  it("409s once the per-place photo cap is reached", async () => {
    const { getPlacePhotosCollection } = await import("@/lib/db/models/placePhoto");
    const { MAX_PHOTOS_PER_PLACE } = await import("@/lib/rateLimit/tiers");
    const photos = await getPlacePhotosCollection();
    const existing = await photos.countDocuments({ placeId, moderationStatus: { $in: ["pending", "approved"] } });
    const now = new Date();
    const toInsert = Array.from({ length: Math.max(0, MAX_PHOTOS_PER_PLACE - existing) }, () => ({
      _id: new ObjectId(),
      placeId,
      url: "https://res.cloudinary.com/test/filler.jpg",
      uploadedBy: uploaderId,
      uploadedAt: now,
      moderationStatus: "approved" as const,
    }));
    if (toInsert.length > 0) await photos.insertMany(toInsert);

    const file = await pngFile();
    const res = await POST(photoRequest(file, sessionCookie), {
      params: Promise.resolve({ id: placeId.toHexString() }),
    });
    expect(res.status).toBe(409);
  });
});
