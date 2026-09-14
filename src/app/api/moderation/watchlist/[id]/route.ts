import { NextResponse, type NextRequest } from "next/server";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { assertModerator } from "@/lib/auth/requireModerator";
import { getPlacesCollection } from "@/lib/db/models/place";
import { getModerationActionsCollection } from "@/lib/db/models/moderationAction";

const watchlistActionSchema = z.object({
  action: z.enum(["dismiss", "remove"]),
  notes: z.string().trim().max(500).optional(),
});

/**
 * POST /api/moderation/watchlist/[id] — act on a spam-score-flagged
 * published place (§2.2's 21-50 band). "dismiss" clears it from the
 * watchlist (spamScore itself is left untouched, for audit); "remove"
 * takes the place down entirely, same as a report's "removed" resolution.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
  const parsed = watchlistActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const { action, notes } = parsed.data;

  const places = await getPlacesCollection();
  const now = new Date();
  const update = action === "dismiss" ? { spamReviewedAt: now } : { status: "removed" as const, updatedAt: now };

  const result = await places.findOneAndUpdate(
    {
      _id: new ObjectId(id),
      status: "published",
      spamScore: { $gte: 21, $lte: 50 },
      spamReviewedAt: { $exists: false },
    },
    { $set: update },
    { returnDocument: "after" },
  );

  if (!result) {
    return NextResponse.json({ error: "No watchlisted place with that id." }, { status: 404 });
  }

  const moderationActions = await getModerationActionsCollection();
  await moderationActions.insertOne({
    _id: new ObjectId(),
    actorId: check.moderator._id,
    action: action === "dismiss" ? "dismiss_watchlist" : "remove_from_watchlist",
    targetType: "place",
    targetId: result._id,
    notes,
    createdAt: now,
  });

  return NextResponse.json({ id: result._id.toHexString(), status: result.status });
}
