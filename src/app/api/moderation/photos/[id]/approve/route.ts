import { NextResponse, type NextRequest } from "next/server";
import { ObjectId } from "mongodb";
import { getCurrentUser } from "@/lib/auth/session";
import { assertModerator } from "@/lib/auth/requireModerator";
import { getPlacePhotosCollection } from "@/lib/db/models/placePhoto";
import { getModerationActionsCollection } from "@/lib/db/models/moderationAction";

/** POST /api/moderation/photos/[id]/approve — publish a pending photo. */
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
    return NextResponse.json({ error: "Invalid photo id" }, { status: 400 });
  }

  const photos = await getPlacePhotosCollection();
  const result = await photos.findOneAndUpdate(
    { _id: new ObjectId(id), moderationStatus: "pending" },
    { $set: { moderationStatus: "approved" } },
    { returnDocument: "after" },
  );

  if (!result) {
    return NextResponse.json({ error: "No pending photo with that id." }, { status: 404 });
  }

  const moderationActions = await getModerationActionsCollection();
  await moderationActions.insertOne({
    _id: new ObjectId(),
    actorId: check.moderator._id,
    action: "approve_photo",
    targetType: "place_photo",
    targetId: result._id,
    createdAt: new Date(),
  });

  return NextResponse.json({ id: result._id.toHexString(), status: result.moderationStatus });
}
