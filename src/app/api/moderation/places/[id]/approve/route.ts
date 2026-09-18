import { NextResponse, type NextRequest } from "next/server";
import { ObjectId } from "mongodb";
import { getCurrentUser } from "@/lib/auth/session";
import { assertModerator } from "@/lib/auth/requireModerator";
import { getPlacesCollection } from "@/lib/db/models/place";
import { getModerationActionsCollection } from "@/lib/db/models/moderationAction";
import { recomputeReputation } from "@/lib/trust/reputation";

/** POST /api/moderation/places/[id]/approve — publish a pending place. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getCurrentUser(request);
  const check = await assertModerator(session);
  if (!check.ok) {
    return NextResponse.json({ error: check.error }, { status: check.status });
  }

  const { id } = await params;
  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid place id" }, { status: 400 });
  }

  const places = await getPlacesCollection();
  const now = new Date();
  const result = await places.findOneAndUpdate(
    { _id: new ObjectId(id), status: "pending" },
    { $set: { status: "published", updatedAt: now } },
    { returnDocument: "after" },
  );

  if (!result) {
    return NextResponse.json({ error: "No pending place with that id." }, { status: 404 });
  }

  // A published place is the strongest positive reputation signal there is
  // — recompute the submitter's level now rather than wait for some later,
  // unrelated event to trigger it.
  if (result.createdBy) {
    await recomputeReputation(result.createdBy);
  }

  const moderationActions = await getModerationActionsCollection();
  await moderationActions.insertOne({
    _id: new ObjectId(),
    actorId: check.moderator._id,
    action: "approve_place",
    targetType: "place",
    targetId: result._id,
    createdAt: now,
  });

  return NextResponse.json({ id: result._id.toHexString(), status: result.status });
}
