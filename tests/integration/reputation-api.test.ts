import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";

/**
 * Exercises reputation recomputation end-to-end through the real routes that
 * trigger it — approve, reject, edit-approve, useful-vote — rather than
 * calling recomputeReputation() directly. The formula itself
 * (computeReputationScore/computeReputationLevel) is unit-tested in
 * tests/unit/reputationScoring.test.ts; this file is only about confirming
 * the wiring actually fires at each call site and persists to the DB.
 */
let mongod: MongoMemoryServer;
let approvePOST: typeof import("@/app/api/moderation/places/[id]/approve/route").POST;
let rejectPOST: typeof import("@/app/api/moderation/places/[id]/reject/route").POST;
let editDecisionPOST: typeof import("@/app/api/moderation/edits/[id]/route").POST;
let usefulPOST: typeof import("@/app/api/places/[id]/useful/route").POST;
let signAccessToken: typeof import("@/lib/auth/jwt").signAccessToken;
let ACCESS_COOKIE: string;
let moderatorCookie: string;
let categoryId: ObjectId;

function cookieRequest(url: string, cookie?: string, body?: unknown) {
  return new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
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

async function makeUser(username: string, accountAgeDays: number) {
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
    stats: BASE_STATS,
    accountStatus: "active",
    createdAt: new Date(Date.now() - accountAgeDays * 24 * 60 * 60 * 1000),
    updatedAt: new Date(),
  });
  const token = await signAccessToken({
    sub: id.toHexString(),
    username,
    roles: ["CONTRIBUTOR"],
    emailVerified: true,
  });
  return { id, cookie: `${ACCESS_COOKIE}=${token}` };
}

async function reputationOf(userId: ObjectId) {
  const { getUsersCollection } = await import("@/lib/db/models/user");
  const users = await getUsersCollection();
  const user = await users.findOne({ _id: userId });
  return user?.reputationLevel;
}

let placeCounter = 0;
async function insertPlace(
  createdBy: ObjectId,
  status: "pending" | "published",
) {
  const { getPlacesCollection } = await import("@/lib/db/models/place");
  const places = await getPlacesCollection();
  placeCounter += 1;
  const now = new Date();
  const doc = {
    _id: new ObjectId(),
    name: `Reputation Test Place ${placeCounter}`,
    slug: `reputation-test-place-${placeCounter}`,
    categoryId,
    phone: `98300000${String(placeCounter).padStart(2, "0")}`,
    district: "North 24 Parganas",
    locality: "Habra",
    pincode: "743263",
    location: { type: "Point" as const, coordinates: [88.69, 22.84] as [number, number] },
    createdBy,
    ownerId: null,
    status,
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

  ({ POST: approvePOST } = await import("@/app/api/moderation/places/[id]/approve/route"));
  ({ POST: rejectPOST } = await import("@/app/api/moderation/places/[id]/reject/route"));
  ({ POST: editDecisionPOST } = await import("@/app/api/moderation/edits/[id]/route"));
  ({ POST: usefulPOST } = await import("@/app/api/places/[id]/useful/route"));
  ({ signAccessToken } = await import("@/lib/auth/jwt"));
  ({ ACCESS_COOKIE } = await import("@/lib/auth/session"));

  const { getCategoriesCollection } = await import("@/lib/db/models/category");
  const categories = await getCategoriesCollection();
  categoryId = new ObjectId();
  await categories.insertOne({
    _id: categoryId,
    slug: "reputation-test-category",
    name: "Reputation Test Category",
    icon: "star",
    synonyms: [],
  });

  const { id: modId, cookie } = await makeUser("reputationmod", 400);
  const { getUsersCollection } = await import("@/lib/db/models/user");
  const users = await getUsersCollection();
  await users.updateOne({ _id: modId }, { $set: { roles: ["MODERATOR"] } });
  moderatorCookie = cookie;
}, 60_000);

afterAll(async () => {
  await mongod?.stop();
});

describe("reputation recomputation via POST /api/moderation/places/[id]/approve", () => {
  it("promotes a contributor to local_explorer once enough places are approved", async () => {
    const { id: contributorId } = await makeUser("approvecontributor", 10);
    expect(await reputationOf(contributorId)).toBe("newcomer");

    const placeIds = await Promise.all([
      insertPlace(contributorId, "pending"),
      insertPlace(contributorId, "pending"),
      insertPlace(contributorId, "pending"),
    ]);

    for (const placeId of placeIds) {
      const res = await approvePOST(
        cookieRequest(`http://localhost/api/moderation/places/${placeId.toHexString()}/approve`, moderatorCookie),
        { params: Promise.resolve({ id: placeId.toHexString() }) },
      );
      expect(res.status).toBe(200);
    }

    // 3 published places * 4 points = 12 >= local_explorer's 10-point bar,
    // account is 10 days old >= its 7-day tenure gate.
    expect(await reputationOf(contributorId)).toBe("local_explorer");
  });
});

describe("reputation recomputation via POST /api/moderation/places/[id]/reject", () => {
  it("can pull a contributor back down out of trusted_contributor", async () => {
    const { id: contributorId } = await makeUser("rejectcontributor", 50);

    const placeIds = await Promise.all(
      Array.from({ length: 15 }, () => insertPlace(contributorId, "pending")),
    );
    for (const placeId of placeIds) {
      await approvePOST(
        cookieRequest(`http://localhost/api/moderation/places/${placeId.toHexString()}/approve`, moderatorCookie),
        { params: Promise.resolve({ id: placeId.toHexString() }) },
      );
    }
    // 15 * 4 = 60 points, account 50 days old, zero rejections — clears
    // trusted_contributor's 50-point / 45-day / clean-record bar.
    expect(await reputationOf(contributorId)).toBe("trusted_contributor");

    const oneMorePlace = await insertPlace(contributorId, "pending");
    const rejectRes = await rejectPOST(
      cookieRequest(`http://localhost/api/moderation/places/${oneMorePlace.toHexString()}/reject`, moderatorCookie),
      { params: Promise.resolve({ id: oneMorePlace.toHexString() }) },
    );
    expect(rejectRes.status).toBe(200);

    // One rejection: the -6 penalty alone doesn't drop the score far, but
    // requireNoRejections disqualifies trusted_contributor/local_guide
    // outright — the account falls to community_scout even though its raw
    // score is still well above the trusted_contributor threshold.
    expect(await reputationOf(contributorId)).toBe("community_scout");

    const { getUsersCollection } = await import("@/lib/db/models/user");
    const users = await getUsersCollection();
    const user = await users.findOne({ _id: contributorId });
    expect(user?.stats.rejectedSubmissions).toBe(1);
  });
});

describe("reputation recomputation via POST /api/moderation/edits/[id]", () => {
  it("counts an approved edit toward reputation", async () => {
    const { id: contributorId, cookie: contributorCookie } = await makeUser("editcontributor", 10);
    // Two already-published places (score 8) — one short of local_explorer's
    // 10-point bar on their own.
    await insertPlace(contributorId, "published");
    const placeToEdit = await insertPlace(contributorId, "published");

    const { getPlaceEditsCollection } = await import("@/lib/db/models/placeEdit");
    const placeEdits = await getPlaceEditsCollection();
    const editId = new ObjectId();
    await placeEdits.insertOne({
      _id: editId,
      placeId: placeToEdit,
      userId: contributorId,
      changes: { phone: { old: "9830000099", new: "9839999999" } },
      status: "pending",
      createdAt: new Date(),
    });

    expect(await reputationOf(contributorId)).toBe("newcomer");

    const res = await editDecisionPOST(
      cookieRequest(`http://localhost/api/moderation/edits/${editId.toHexString()}`, moderatorCookie, {
        decision: "approve",
      }),
      { params: Promise.resolve({ id: editId.toHexString() }) },
    );
    expect(res.status).toBe(200);

    // 2 published places (8) + 1 approved edit (2) = 10 — now clears
    // local_explorer.
    expect(await reputationOf(contributorId)).toBe("local_explorer");
    void contributorCookie; // not needed for this flow beyond documenting who the actor is
  });
});

describe("reputation recomputation via POST /api/places/[id]/useful", () => {
  it("counts a useful vote toward the place owner's reputation", async () => {
    const { id: ownerId } = await makeUser("voteowner", 10);
    const { cookie: voterCookie } = await makeUser("votecaster", 10);
    // Two already-published places (score 8) — one short of local_explorer's
    // 10-point bar on their own.
    await insertPlace(ownerId, "published");
    const votedPlace = await insertPlace(ownerId, "published");

    expect(await reputationOf(ownerId)).toBe("newcomer");

    const res = await usefulPOST(
      cookieRequest(`http://localhost/api/places/${votedPlace.toHexString()}/useful`, voterCookie, {
        value: "useful",
      }),
      { params: Promise.resolve({ id: votedPlace.toHexString() }) },
    );
    expect(res.status).toBe(200);

    // 2 published places (8) + ln(1+1)*3 ≈ 2.08 (rounded into the total) =
    // score 10 — clears local_explorer.
    expect(await reputationOf(ownerId)).toBe("local_explorer");
  });
});
