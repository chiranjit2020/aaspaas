import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";

/**
 * Exercises the moderation routes against a real in-memory MongoDB. The
 * specific thing worth a real test here (per §2's "Moderation privilege
 * escalation" row): role is re-checked fresh from the DB on every call,
 * never trusted from the JWT alone. A JWT signed while someone was a
 * MODERATOR is still cryptographically valid for up to 15 minutes after
 * their role is revoked in the DB — the route must reject it anyway.
 */
let mongod: MongoMemoryServer;
let queueGET: typeof import("@/app/api/moderation/queue/route").GET;
let approvePOST: typeof import("@/app/api/moderation/places/[id]/approve/route").POST;
let rejectPOST: typeof import("@/app/api/moderation/places/[id]/reject/route").POST;
let editDecisionPOST: typeof import("@/app/api/moderation/edits/[id]/route").POST;
let resolveReportPOST: typeof import("@/app/api/moderation/reports/[id]/resolve/route").POST;
let signAccessToken: typeof import("@/lib/auth/jwt").signAccessToken;
let ACCESS_COOKIE: string;

let moderatorId: ObjectId;
let moderatorCookie: string;
let contributorId: ObjectId;
let contributorCookie: string;
let demotedModeratorCookie: string; // JWT claims MODERATOR; DB says otherwise
let categoryId: ObjectId;

function cookieRequest(
  url: string,
  cookie?: string,
  init: { method?: string; body?: string; headers?: Record<string, string> } = {},
) {
  return new NextRequest(url, {
    method: init.method,
    body: init.body,
    headers: { ...init.headers, ...(cookie ? { cookie } : {}) },
  });
}

async function insertPendingPlace(name: string) {
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
    createdBy: contributorId,
    ownerId: null,
    status: "pending" as const,
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

async function insertPublishedPlace(name: string) {
  const { getPlacesCollection } = await import("@/lib/db/models/place");
  const places = await getPlacesCollection();
  const now = new Date();
  const doc = {
    _id: new ObjectId(),
    name,
    slug: name.toLowerCase().replace(/\s+/g, "-"),
    categoryId,
    phone: "9830000000",
    district: "North 24 Parganas",
    locality: "Habra",
    pincode: "743263",
    location: { type: "Point" as const, coordinates: [88.69, 22.84] as [number, number] },
    createdBy: contributorId,
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

async function insertPendingEdit(placeId: ObjectId, userId: ObjectId) {
  const { getPlaceEditsCollection } = await import("@/lib/db/models/placeEdit");
  const placeEdits = await getPlaceEditsCollection();
  const doc = {
    _id: new ObjectId(),
    placeId,
    userId,
    changes: { phone: { old: "9830000000", new: "9839999999" } },
    status: "pending" as const,
    createdAt: new Date(),
  };
  await placeEdits.insertOne(doc);
  return doc._id;
}

async function insertOpenReport(placeId: ObjectId, userId: ObjectId) {
  const { getReportsCollection } = await import("@/lib/db/models/report");
  const reports = await getReportsCollection();
  const doc = {
    _id: new ObjectId(),
    placeId,
    userId,
    reason: "wrong_info" as const,
    status: "open" as const,
    createdAt: new Date(),
  };
  await reports.insertOne(doc);
  return doc._id;
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  process.env.MONGODB_DB_NAME = "aaspaas_test";
  process.env.JWT_ACCESS_SECRET = "test-secret-do-not-use-in-real-life";

  ({ GET: queueGET } = await import("@/app/api/moderation/queue/route"));
  ({ POST: approvePOST } = await import("@/app/api/moderation/places/[id]/approve/route"));
  ({ POST: rejectPOST } = await import("@/app/api/moderation/places/[id]/reject/route"));
  ({ POST: editDecisionPOST } = await import("@/app/api/moderation/edits/[id]/route"));
  ({ POST: resolveReportPOST } = await import("@/app/api/moderation/reports/[id]/resolve/route"));
  ({ signAccessToken } = await import("@/lib/auth/jwt"));
  ({ ACCESS_COOKIE } = await import("@/lib/auth/session"));

  const { getCategoriesCollection } = await import("@/lib/db/models/category");
  const { getUsersCollection } = await import("@/lib/db/models/user");

  const categories = await getCategoriesCollection();
  categoryId = new ObjectId();
  await categories.insertOne({
    _id: categoryId,
    slug: "bakery",
    name: "Bakery",
    icon: "croissant",
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
  await users.insertOne({ ...baseUser, _id: moderatorId, username: "themod", roles: ["MODERATOR"] });
  const moderatorToken = await signAccessToken({
    sub: moderatorId.toHexString(),
    username: "themod",
    roles: ["MODERATOR"],
    emailVerified: true,
  });
  moderatorCookie = `${ACCESS_COOKIE}=${moderatorToken}`;

  contributorId = new ObjectId();
  await users.insertOne({
    ...baseUser,
    _id: contributorId,
    username: "justauser",
    roles: ["CONTRIBUTOR"],
  });
  const contributorToken = await signAccessToken({
    sub: contributorId.toHexString(),
    username: "justauser",
    roles: ["CONTRIBUTOR"],
    emailVerified: true,
  });
  contributorCookie = `${ACCESS_COOKIE}=${contributorToken}`;

  // Signed while this user WAS a moderator in the DB...
  const demotedId = new ObjectId();
  await users.insertOne({ ...baseUser, _id: demotedId, username: "exmod", roles: ["MODERATOR"] });
  const demotedToken = await signAccessToken({
    sub: demotedId.toHexString(),
    username: "exmod",
    roles: ["MODERATOR"],
    emailVerified: true,
  });
  demotedModeratorCookie = `${ACCESS_COOKIE}=${demotedToken}`;
  // ...then demoted in the DB. The JWT above still (correctly, cryptographically)
  // claims MODERATOR and won't expire for 15 minutes.
  await users.updateOne({ _id: demotedId }, { $set: { roles: ["CONTRIBUTOR"] } });
}, 60_000);

afterAll(async () => {
  await mongod?.stop();
});

describe("GET /api/moderation/queue", () => {
  it("401s without a session", async () => {
    const res = await queueGET(cookieRequest("http://localhost/api/moderation/queue"));
    expect(res.status).toBe(401);
  });

  it("403s for a logged-in non-moderator", async () => {
    const res = await queueGET(cookieRequest("http://localhost/api/moderation/queue", contributorCookie));
    expect(res.status).toBe(403);
  });

  it("403s a stale JWT claiming a role the DB no longer grants", async () => {
    const res = await queueGET(
      cookieRequest("http://localhost/api/moderation/queue", demotedModeratorCookie),
    );
    expect(res.status).toBe(403);
  });

  it("200s for an actual moderator and lists pending places", async () => {
    await insertPendingPlace("Queue Visible Bakery");
    const res = await queueGET(cookieRequest("http://localhost/api/moderation/queue", moderatorCookie));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.places.some((i: { name: string }) => i.name === "Queue Visible Bakery")).toBe(true);
    // Shape check — edits/reports are M4 additions to the same queue.
    expect(Array.isArray(body.edits)).toBe(true);
    expect(Array.isArray(body.reports)).toBe(true);
  });
});

describe("POST /api/moderation/places/[id]/approve", () => {
  it("403s a non-moderator even for a real pending place", async () => {
    const id = await insertPendingPlace("Approve Target Bakery");
    const res = await approvePOST(
      cookieRequest(`http://localhost/api/moderation/places/${id}/approve`, contributorCookie, {
        method: "POST",
      }),
      { params: Promise.resolve({ id: id.toHexString() }) },
    );
    expect(res.status).toBe(403);
  });

  it("publishes the place and logs a moderation_actions entry", async () => {
    const id = await insertPendingPlace("Should Get Published Bakery");
    const res = await approvePOST(
      cookieRequest(`http://localhost/api/moderation/places/${id}/approve`, moderatorCookie, {
        method: "POST",
      }),
      { params: Promise.resolve({ id: id.toHexString() }) },
    );
    expect(res.status).toBe(200);

    const { getPlacesCollection } = await import("@/lib/db/models/place");
    const places = await getPlacesCollection();
    const doc = await places.findOne({ _id: id });
    expect(doc?.status).toBe("published");

    const { getModerationActionsCollection } = await import("@/lib/db/models/moderationAction");
    const actions = await getModerationActionsCollection();
    const action = await actions.findOne({ targetId: id, action: "approve_place" });
    expect(action?.actorId.equals(moderatorId)).toBe(true);
  });

  it("404s a place that's already been decided (not pending anymore)", async () => {
    const id = await insertPendingPlace("Double Approve Bakery");
    await approvePOST(
      cookieRequest(`http://localhost/api/moderation/places/${id}/approve`, moderatorCookie, {
        method: "POST",
      }),
      { params: Promise.resolve({ id: id.toHexString() }) },
    );
    const second = await approvePOST(
      cookieRequest(`http://localhost/api/moderation/places/${id}/approve`, moderatorCookie, {
        method: "POST",
      }),
      { params: Promise.resolve({ id: id.toHexString() }) },
    );
    expect(second.status).toBe(404);
  });
});

describe("POST /api/moderation/places/[id]/reject", () => {
  it("rejects the place and logs the action", async () => {
    const id = await insertPendingPlace("Should Get Rejected Bakery");
    const res = await rejectPOST(
      cookieRequest(`http://localhost/api/moderation/places/${id}/reject`, moderatorCookie, {
        method: "POST",
        body: JSON.stringify({ notes: "looks fake" }),
        headers: { "Content-Type": "application/json" },
      }),
      { params: Promise.resolve({ id: id.toHexString() }) },
    );
    expect(res.status).toBe(200);

    const { getPlacesCollection } = await import("@/lib/db/models/place");
    const places = await getPlacesCollection();
    const doc = await places.findOne({ _id: id });
    expect(doc?.status).toBe("rejected");

    const { getModerationActionsCollection } = await import("@/lib/db/models/moderationAction");
    const actions = await getModerationActionsCollection();
    const action = await actions.findOne({ targetId: id, action: "reject_place" });
    expect(action?.notes).toBe("looks fake");
  });

  it("increments the submitter's rejectedSubmissions stat", async () => {
    const id = await insertPendingPlace("Stat Tracked Rejection Bakery");
    await rejectPOST(
      cookieRequest(`http://localhost/api/moderation/places/${id}/reject`, moderatorCookie, {
        method: "POST",
      }),
      { params: Promise.resolve({ id: id.toHexString() }) },
    );

    const { getUsersCollection } = await import("@/lib/db/models/user");
    const users = await getUsersCollection();
    const contributor = await users.findOne({ _id: contributorId });
    expect(contributor?.stats.rejectedSubmissions).toBeGreaterThan(0);
  });
});

describe("POST /api/moderation/edits/[id]", () => {
  it("403s a non-moderator", async () => {
    const placeId = await insertPublishedPlace("Edit Guard Bakery");
    const editId = await insertPendingEdit(placeId, contributorId);
    const res = await editDecisionPOST(
      cookieRequest(`http://localhost/api/moderation/edits/${editId}`, contributorCookie, {
        method: "POST",
        body: JSON.stringify({ decision: "approve" }),
        headers: { "Content-Type": "application/json" },
      }),
      { params: Promise.resolve({ id: editId.toHexString() }) },
    );
    expect(res.status).toBe(403);
  });

  it("approving applies the change to the place and credits correctionsMade", async () => {
    const placeId = await insertPublishedPlace("Edit Approve Bakery");
    const editId = await insertPendingEdit(placeId, contributorId);
    const res = await editDecisionPOST(
      cookieRequest(`http://localhost/api/moderation/edits/${editId}`, moderatorCookie, {
        method: "POST",
        body: JSON.stringify({ decision: "approve" }),
        headers: { "Content-Type": "application/json" },
      }),
      { params: Promise.resolve({ id: editId.toHexString() }) },
    );
    expect(res.status).toBe(200);

    const { getPlacesCollection } = await import("@/lib/db/models/place");
    const places = await getPlacesCollection();
    const place = await places.findOne({ _id: placeId });
    expect(place?.phone).toBe("9839999999");

    const { getPlaceEditsCollection } = await import("@/lib/db/models/placeEdit");
    const placeEdits = await getPlaceEditsCollection();
    const edit = await placeEdits.findOne({ _id: editId });
    expect(edit?.status).toBe("approved");
    expect(edit?.reviewedBy?.equals(moderatorId)).toBe(true);

    const { getUsersCollection } = await import("@/lib/db/models/user");
    const users = await getUsersCollection();
    const contributor = await users.findOne({ _id: contributorId });
    expect(contributor?.stats.correctionsMade).toBeGreaterThan(0);
  });

  it("rejecting leaves the place untouched", async () => {
    const placeId = await insertPublishedPlace("Edit Reject Bakery");
    const editId = await insertPendingEdit(placeId, contributorId);
    const res = await editDecisionPOST(
      cookieRequest(`http://localhost/api/moderation/edits/${editId}`, moderatorCookie, {
        method: "POST",
        body: JSON.stringify({ decision: "reject" }),
        headers: { "Content-Type": "application/json" },
      }),
      { params: Promise.resolve({ id: editId.toHexString() }) },
    );
    expect(res.status).toBe(200);

    const { getPlacesCollection } = await import("@/lib/db/models/place");
    const places = await getPlacesCollection();
    const place = await places.findOne({ _id: placeId });
    expect(place?.phone).toBe("9830000000"); // unchanged
  });

  it("404s an edit that's already been decided", async () => {
    const placeId = await insertPublishedPlace("Edit Double Decide Bakery");
    const editId = await insertPendingEdit(placeId, contributorId);
    await editDecisionPOST(
      cookieRequest(`http://localhost/api/moderation/edits/${editId}`, moderatorCookie, {
        method: "POST",
        body: JSON.stringify({ decision: "approve" }),
        headers: { "Content-Type": "application/json" },
      }),
      { params: Promise.resolve({ id: editId.toHexString() }) },
    );
    const second = await editDecisionPOST(
      cookieRequest(`http://localhost/api/moderation/edits/${editId}`, moderatorCookie, {
        method: "POST",
        body: JSON.stringify({ decision: "approve" }),
        headers: { "Content-Type": "application/json" },
      }),
      { params: Promise.resolve({ id: editId.toHexString() }) },
    );
    expect(second.status).toBe(404);
  });
});

describe("POST /api/moderation/reports/[id]/resolve", () => {
  it("403s a non-moderator", async () => {
    const placeId = await insertPublishedPlace("Report Guard Bakery");
    const reportId = await insertOpenReport(placeId, contributorId);
    const res = await resolveReportPOST(
      cookieRequest(`http://localhost/api/moderation/reports/${reportId}/resolve`, contributorCookie, {
        method: "POST",
        body: JSON.stringify({ resolution: "kept" }),
        headers: { "Content-Type": "application/json" },
      }),
      { params: Promise.resolve({ id: reportId.toHexString() }) },
    );
    expect(res.status).toBe(403);
  });

  it("'removed' resolution takes the place down", async () => {
    const placeId = await insertPublishedPlace("Report Removed Bakery");
    const reportId = await insertOpenReport(placeId, contributorId);
    const res = await resolveReportPOST(
      cookieRequest(`http://localhost/api/moderation/reports/${reportId}/resolve`, moderatorCookie, {
        method: "POST",
        body: JSON.stringify({ resolution: "removed" }),
        headers: { "Content-Type": "application/json" },
      }),
      { params: Promise.resolve({ id: reportId.toHexString() }) },
    );
    expect(res.status).toBe(200);

    const { getPlacesCollection } = await import("@/lib/db/models/place");
    const places = await getPlacesCollection();
    const place = await places.findOne({ _id: placeId });
    expect(place?.status).toBe("removed");

    const { getReportsCollection } = await import("@/lib/db/models/report");
    const reports = await getReportsCollection();
    const report = await reports.findOne({ _id: reportId });
    expect(report?.status).toBe("resolved");
    expect(report?.resolution).toBe("removed");
  });

  it("'kept' resolution leaves the place published", async () => {
    const placeId = await insertPublishedPlace("Report Kept Bakery");
    const reportId = await insertOpenReport(placeId, contributorId);
    await resolveReportPOST(
      cookieRequest(`http://localhost/api/moderation/reports/${reportId}/resolve`, moderatorCookie, {
        method: "POST",
        body: JSON.stringify({ resolution: "kept" }),
        headers: { "Content-Type": "application/json" },
      }),
      { params: Promise.resolve({ id: reportId.toHexString() }) },
    );

    const { getPlacesCollection } = await import("@/lib/db/models/place");
    const places = await getPlacesCollection();
    const place = await places.findOne({ _id: placeId });
    expect(place?.status).toBe("published");
  });

  it("404s a report that's already resolved", async () => {
    const placeId = await insertPublishedPlace("Report Double Resolve Bakery");
    const reportId = await insertOpenReport(placeId, contributorId);
    await resolveReportPOST(
      cookieRequest(`http://localhost/api/moderation/reports/${reportId}/resolve`, moderatorCookie, {
        method: "POST",
        body: JSON.stringify({ resolution: "kept" }),
        headers: { "Content-Type": "application/json" },
      }),
      { params: Promise.resolve({ id: reportId.toHexString() }) },
    );
    const second = await resolveReportPOST(
      cookieRequest(`http://localhost/api/moderation/reports/${reportId}/resolve`, moderatorCookie, {
        method: "POST",
        body: JSON.stringify({ resolution: "kept" }),
        headers: { "Content-Type": "application/json" },
      }),
      { params: Promise.resolve({ id: reportId.toHexString() }) },
    );
    expect(second.status).toBe(404);
  });
});
