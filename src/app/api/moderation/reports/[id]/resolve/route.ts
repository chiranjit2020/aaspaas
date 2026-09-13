import { NextResponse, type NextRequest } from "next/server";
import { ObjectId } from "mongodb";
import { getCurrentUser } from "@/lib/auth/session";
import { assertModerator } from "@/lib/auth/requireModerator";
import { getReportsCollection } from "@/lib/db/models/report";
import { getPlacesCollection } from "@/lib/db/models/place";
import { getModerationActionsCollection } from "@/lib/db/models/moderationAction";
import { reportResolutionSchema } from "@/lib/validation/report";

/**
 * POST /api/moderation/reports/[id]/resolve — close a report with a
 * resolution. "removed" also takes the reported place down (status →
 * removed); "kept" and "corrected" leave the place's status untouched —
 * a "corrected" resolution means the fix should already have landed as its
 * own approved place_edit, not something this endpoint does on its behalf.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getCurrentUser(request);
  const check = await assertModerator(session);
  if (!check.ok) {
    return NextResponse.json({ error: check.error }, { status: check.status });
  }

  const { id } = await params;
  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid report id" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = reportResolutionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const { resolution, notes } = parsed.data;

  const reports = await getReportsCollection();
  const report = await reports.findOne({ _id: new ObjectId(id), status: { $in: ["open", "reviewing"] } });
  if (!report) {
    return NextResponse.json({ error: "No open report with that id." }, { status: 404 });
  }

  const now = new Date();
  await reports.updateOne(
    { _id: report._id },
    { $set: { status: "resolved", resolvedBy: check.moderator._id, resolution } },
  );

  if (resolution === "removed") {
    const places = await getPlacesCollection();
    await places.updateOne({ _id: report.placeId }, { $set: { status: "removed", updatedAt: now } });
  }

  const moderationActions = await getModerationActionsCollection();
  await moderationActions.insertOne({
    _id: new ObjectId(),
    actorId: check.moderator._id,
    action: `resolve_report_${resolution}`,
    targetType: "report",
    targetId: report._id,
    notes,
    createdAt: now,
  });

  return NextResponse.json({ id: report._id.toHexString(), status: "resolved", resolution });
}
