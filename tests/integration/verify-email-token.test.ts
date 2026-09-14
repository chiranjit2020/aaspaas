import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { ObjectId } from "mongodb";

/**
 * Exercises verifyEmailToken against a real in-memory Mongo — specifically
 * the idempotency fix: a token that's already been consumed (e.g. by an
 * email provider's link-safety scanner pre-fetching it before the real
 * click) should still report success on a second hit if the account it
 * belongs to is already verified, rather than a confusing "invalid" error.
 */
let mongod: MongoMemoryServer;
let verifyEmailToken: typeof import("@/lib/auth/verifyEmailToken").verifyEmailToken;
let generateOpaqueToken: typeof import("@/lib/auth/tokens").generateOpaqueToken;
let hashOpaqueToken: typeof import("@/lib/auth/tokens").hashOpaqueToken;

const BASE_STATS = {
  placesAdded: 0,
  placesVerified: 0,
  correctionsMade: 0,
  reportsFiled: 0,
  usefulVotesReceived: 0,
  rejectedSubmissions: 0,
  spamReportsAgainst: 0,
};

async function makeUnverifiedUser(username: string) {
  const { getUsersCollection } = await import("@/lib/db/models/user");
  const users = await getUsersCollection();
  const id = new ObjectId();
  await users.insertOne({
    _id: id,
    displayName: username,
    username,
    email: `${username}@example.com`,
    emailVerified: false,
    passwordHash: "irrelevant",
    roles: ["CONTRIBUTOR"],
    reputationLevel: "newcomer",
    stats: BASE_STATS,
    accountStatus: "active",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return id;
}

async function makeToken(userId: ObjectId, overrides: Record<string, unknown> = {}) {
  const { getEmailVerificationTokensCollection } = await import(
    "@/lib/db/models/emailVerificationToken"
  );
  const tokens = await getEmailVerificationTokensCollection();
  const raw = generateOpaqueToken();
  await tokens.insertOne({
    _id: new ObjectId(),
    userId,
    tokenHash: hashOpaqueToken(raw),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    createdAt: new Date(),
    ...overrides,
  });
  return raw;
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  process.env.MONGODB_DB_NAME = "aaspaas_test";
  process.env.JWT_ACCESS_SECRET = "test-secret-do-not-use-in-real-life";

  ({ verifyEmailToken } = await import("@/lib/auth/verifyEmailToken"));
  ({ generateOpaqueToken, hashOpaqueToken } = await import("@/lib/auth/tokens"));
}, 60_000);

afterAll(async () => {
  await mongod?.stop();
});

describe("verifyEmailToken", () => {
  it("rejects a token that doesn't exist at all", async () => {
    const result = await verifyEmailToken("not-a-real-token");
    expect(result.ok).toBe(false);
  });

  it("verifies a fresh, valid token and marks it used", async () => {
    const userId = await makeUnverifiedUser("freshtoken");
    const raw = await makeToken(userId);

    const result = await verifyEmailToken(raw);
    expect(result.ok).toBe(true);

    const { getUsersCollection } = await import("@/lib/db/models/user");
    const users = await getUsersCollection();
    const user = await users.findOne({ _id: userId });
    expect(user?.emailVerified).toBe(true);
  });

  it("clicking the same link again after it already verified still reports success", async () => {
    const userId = await makeUnverifiedUser("doubleclick");
    const raw = await makeToken(userId);

    const first = await verifyEmailToken(raw);
    expect(first.ok).toBe(true);

    // Simulates a spam-filter prefetch (or just a second real click) hitting
    // an already-consumed token — this used to return "invalid or expired."
    const second = await verifyEmailToken(raw);
    expect(second.ok).toBe(true);
  });

  it("rejects an expired, unused token", async () => {
    const userId = await makeUnverifiedUser("expiredtoken");
    const raw = await makeToken(userId, { expiresAt: new Date(Date.now() - 1000) });

    const result = await verifyEmailToken(raw);
    expect(result.ok).toBe(false);

    const { getUsersCollection } = await import("@/lib/db/models/user");
    const users = await getUsersCollection();
    const user = await users.findOne({ _id: userId });
    expect(user?.emailVerified).toBe(false);
  });

  it("rejects a used token whose account somehow still isn't verified", async () => {
    const userId = await makeUnverifiedUser("inconsistent");
    const raw = await makeToken(userId, { usedAt: new Date() });

    const result = await verifyEmailToken(raw);
    expect(result.ok).toBe(false);
  });
});
