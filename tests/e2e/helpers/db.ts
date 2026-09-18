import { ObjectId } from "mongodb";
import { CATEGORY_ID } from "../fixtures";

/**
 * Direct DB fixtures for the parts of a flow that aren't the thing under
 * test — e.g. "report → moderation queue" needs a pre-existing published
 * place and a pre-verified reporter, neither of which is what that spec is
 * actually checking. Real user-facing steps (register, login, add-place,
 * report) still go through the real UI in the specs themselves.
 */

export async function markEmailVerified(email: string): Promise<void> {
  const { getUsersCollection } = await import("@/lib/db/models/user");
  const users = await getUsersCollection();
  await users.updateOne({ email }, { $set: { emailVerified: true } });
}

export async function createVerifiedUser(input: {
  username: string;
  email: string;
  password: string;
}): Promise<void> {
  const { getUsersCollection } = await import("@/lib/db/models/user");
  const { hashPassword } = await import("@/lib/auth/password");
  const users = await getUsersCollection();
  const now = new Date();
  await users.insertOne({
    _id: new ObjectId(),
    displayName: input.username,
    username: input.username,
    email: input.email,
    emailVerified: true,
    passwordHash: await hashPassword(input.password),
    roles: ["CONTRIBUTOR"],
    reputationLevel: "newcomer",
    stats: {
      placesAdded: 0,
      placesVerified: 0,
      correctionsMade: 0,
      reportsFiled: 0,
      usefulVotesReceived: 0,
      rejectedSubmissions: 0,
      spamReportsAgainst: 0,
    },
    accountStatus: "active",
    createdAt: now,
    updatedAt: now,
  });
}

export async function createPublishedPlace(input: {
  name: string;
  createdBy: ObjectId;
}): Promise<{ id: string; slug: string; name: string }> {
  const { getPlacesCollection } = await import("@/lib/db/models/place");
  const places = await getPlacesCollection();
  const now = new Date();
  const slug = input.name.toLowerCase().replace(/\s+/g, "-");
  const doc = {
    _id: new ObjectId(),
    name: input.name,
    slug,
    categoryId: CATEGORY_ID,
    district: "North 24 Parganas",
    locality: "Habra",
    pincode: "743263",
    location: { type: "Point" as const, coordinates: [88.69, 22.84] as [number, number] },
    createdBy: input.createdBy,
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
  return { id: doc._id.toHexString(), slug, name: doc.name };
}
