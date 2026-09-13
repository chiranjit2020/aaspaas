import { NextResponse, type NextRequest } from "next/server";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { assertModerator } from "@/lib/auth/requireModerator";
import { getPlacesCollection } from "@/lib/db/models/place";
import { getUsersCollection } from "@/lib/db/models/user";
import { getModerationActionsCollection } from "@/lib/db/models/moderationAction";

const rejectBodySchema = z.object({
  notes: z.string().trim().max(500).optional(),
});

/** POST /api/moderation/places/[id]/reject — reject a pending place. */
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

  const body = await request.json().catch(() => ({}));
  const parsed = rejectBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const places = await getPlacesCollection();
  const now = new Date();
  const result = await places.findOneAndUpdate(
    { _id: new ObjectId(id), status: "pending" },
    { $set: { status: "rejected", updatedAt: now } },
    { returnDocument: "after" },
  );

  if (!result) {
    return NextResponse.json({ error: "No pending place with that id." }, { status: 404 });
  }

  if (result.createdBy) {
    const users = await getUsersCollection();
    await users.updateOne({ _id: result.createdBy }, { $inc: { "stats.rejectedSubmissions": 1 } });
  }

  const moderationActions = await getModerationActionsCollection();
  await moderationActions.insertOne({
    _id: new ObjectId(),
    actorId: check.moderator._id,
    action: "reject_place",
    targetType: "place",
    targetId: result._id,
    notes: parsed.data.notes,
    createdAt: now,
  });

  return NextResponse.json({ id: result._id.toHexString(), status: result.status });
}
