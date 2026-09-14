import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";

/**
 * Exercises POST /api/auth/login against a real in-memory Mongo.
 *
 * Regression coverage for the emailVerified gap: an account that never
 * clicked its verification link used to get a full session anyway, because
 * the route only checked `accountStatus`. See login-missing-email-verified-check.
 */
let mongod: MongoMemoryServer;
let POST: typeof import("@/app/api/auth/login/route").POST;
let hashPassword: typeof import("@/lib/auth/password").hashPassword;
let ACCESS_COOKIE: string;
let REFRESH_COOKIE: string;

const BASE_STATS = {
  placesAdded: 0,
  placesVerified: 0,
  correctionsMade: 0,
  reportsFiled: 0,
  usefulVotesReceived: 0,
  rejectedSubmissions: 0,
  spamReportsAgainst: 0,
};

const PASSWORD = "correct horse battery staple";

function loginRequest(body: unknown) {
  return new NextRequest("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function makeUser(overrides: {
  username: string;
  emailVerified: boolean;
  accountStatus?: "active" | "suspended" | "banned";
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
    passwordHash: await hashPassword(PASSWORD),
    roles: ["CONTRIBUTOR"],
    reputationLevel: "newcomer",
    stats: BASE_STATS,
    accountStatus: overrides.accountStatus ?? "active",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return id;
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  process.env.MONGODB_DB_NAME = "aaspaas_test";
  process.env.JWT_ACCESS_SECRET = "test-secret-do-not-use-in-real-life";

  ({ POST } = await import("@/app/api/auth/login/route"));
  ({ hashPassword } = await import("@/lib/auth/password"));
  ({ ACCESS_COOKIE, REFRESH_COOKIE } = await import("@/lib/auth/session"));
}, 60_000);

afterAll(async () => {
  await mongod?.stop();
});

describe("POST /api/auth/login", () => {
  it("logs in a verified, active user and issues both cookies", async () => {
    await makeUser({ username: "verifieduser", emailVerified: true });

    const response = await POST(loginRequest({ identifier: "verifieduser", password: PASSWORD }));
    expect(response.status).toBe(200);
    expect(response.cookies.get(ACCESS_COOKIE)?.value).toBeTruthy();
    expect(response.cookies.get(REFRESH_COOKIE)?.value).toBeTruthy();
  });

  it("rejects an unverified user with 403 and issues no cookies", async () => {
    const userId = await makeUser({ username: "unverifieduser", emailVerified: false });

    const response = await POST(loginRequest({ identifier: "unverifieduser", password: PASSWORD }));
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toMatch(/verify/i);
    expect(response.cookies.get(ACCESS_COOKIE)?.value).toBeFalsy();
    expect(response.cookies.get(REFRESH_COOKIE)?.value).toBeFalsy();

    // No session should have been persisted for this specific account either
    // — not just "the response looked rejected."
    const { getRefreshTokensCollection } = await import("@/lib/db/models/refreshToken");
    const refreshTokens = await getRefreshTokensCollection();
    expect(await refreshTokens.countDocuments({ userId })).toBe(0);
  });

  it("still checks accountStatus before emailVerified so an inactive account isn't misreported as just needing verification", async () => {
    await makeUser({ username: "inactiveuser", emailVerified: false, accountStatus: "suspended" });

    const response = await POST(loginRequest({ identifier: "inactiveuser", password: PASSWORD }));
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toMatch(/no longer active/i);
  });

  it("rejects a wrong password for an unverified account with a generic error, not the verification message", async () => {
    await makeUser({ username: "wrongpassuser", emailVerified: false });

    const response = await POST(loginRequest({ identifier: "wrongpassuser", password: "not the password" }));
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toMatch(/invalid username\/email or password/i);
  });

  it("rejects an unknown identifier with the same generic error", async () => {
    const response = await POST(loginRequest({ identifier: "nobody-registered", password: PASSWORD }));
    expect(response.status).toBe(401);
  });
});
