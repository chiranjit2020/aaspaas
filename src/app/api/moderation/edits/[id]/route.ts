import { NextResponse, type NextRequest } from "next/server";
import { ObjectId } from "mongodb";
import { getCurrentUser } from "@/lib/auth/session";
import { assertModerator } from "@/lib/auth/requireModerator";
import { getPlaceEditsCollection } from "@/lib/db/models/placeEdit";
import { getPlacesCollection } from "@/lib/db/models/place";
import { getUsersCollection } from "@/lib/db/models/user";
import { getModerationActionsCollection } from "@/lib/db/models/moderationAction";
import { editDecisionSchema } from "@/lib/validation/editDecision";
import { applyPlaceEditChanges } from "@/lib/places/diffPlaceEdit";
import { recomputeReputation } from "@/lib/trust/reputation";

/**
 * POST /api/moderation/edits/[id] — approve or reject a proposed edit.
 * Approving applies the diff straight to the place document; rejecting
 * leaves the place untouched. Either way the edit is logged and the
 * submitter's correctionsMade stat only moves on approval — a rejected
 * suggestion isn't a correction that actually happened.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getCurrentUser(request);
  const check = await assertModerator(session);
  if (!check.ok) {
    return NextResponse.json({ error: check.error }, { status: check.status });
  }

  const { id } = await params;
  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid edit id" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = editDecisionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const { decision, notes } = parsed.data;

  const placeEdits = await getPlaceEditsCollection();
  const edit = await placeEdits.findOne({ _id: new ObjectId(id), status: "pending" });
  if (!edit) {
    return NextResponse.json({ error: "No pending edit with that id." }, { status: 404 });
  }

  const now = new Date();
  const newStatus = decision === "approve" ? "approved" : "rejected";

  await placeEdits.updateOne(
    { _id: edit._id },
    { $set: { status: newStatus, reviewedBy: check.moderator._id } },
  );

  if (decision === "approve") {
    const places = await getPlacesCollection();
    const update = applyPlaceEditChanges(edit.changes);
    await places.updateOne({ _id: edit.placeId }, { $set: { ...update, updatedAt: now } });

    const users = await getUsersCollection();
    await users.updateOne({ _id: edit.userId }, { $inc: { "stats.correctionsMade": 1 } });
    await recomputeReputation(edit.userId);
  }

  const moderationActions = await getModerationActionsCollection();
  await moderationActions.insertOne({
    _id: new ObjectId(),
    actorId: check.moderator._id,
    action: decision === "approve" ? "approve_edit" : "reject_edit",
    targetType: "place_edit",
    targetId: edit._id,
    notes,
    createdAt: now,
  });

  return NextResponse.json({ id: edit._id.toHexString(), status: newStatus });
}
