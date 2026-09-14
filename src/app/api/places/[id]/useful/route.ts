import { NextResponse, type NextRequest } from "next/server";
import { ObjectId } from "mongodb";
import { getCurrentUser } from "@/lib/auth/session";
import { getPlacesCollection } from "@/lib/db/models/place";
import { getUsefulVotesCollection } from "@/lib/db/models/usefulVote";
import { getUsersCollection } from "@/lib/db/models/user";
import { usefulVoteInputSchema } from "@/lib/validation/usefulVote";
import { computeVoteTransition } from "@/lib/trust/voteTransition";
import { checkRateLimit } from "@/lib/rateLimit";
import { VOTE_DAILY_LIMIT, ONE_DAY_MS } from "@/lib/rateLimit/tiers";

/**
 * POST /api/places/[id]/useful — cast, switch, or toggle off a
 * useful/not-useful vote. One vote per (place, user) — enforced by both the
 * unique index and this route's read-before-write logic (see
 * lib/trust/voteTransition.ts for the insert/update/delete decision table).
 *
 * Not transactional: the vote document and the two counter updates are
 * separate writes, same pragmatic tradeoff already made elsewhere in this
 * app (e.g. place creation + the submitter's stats.placesAdded bump).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getCurrentUser(request);
  if (!session) {
    return NextResponse.json({ error: "You must be logged in to vote." }, { status: 401 });
  }

  const rate = await checkRateLimit({
    key: `vote:${session.sub}`,
    limit: VOTE_DAILY_LIMIT,
    windowMs: ONE_DAY_MS,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: `Daily vote limit reached (${VOTE_DAILY_LIMIT}/day). Try again tomorrow.` },
      { status: 429 },
    );
  }

  const { id } = await params;
  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid place id" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = usefulVoteInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const { value } = parsed.data;

  const places = await getPlacesCollection();
  const place = await places.findOne({ _id: new ObjectId(id), status: "published" });
  if (!place) {
    return NextResponse.json({ error: "Place not found" }, { status: 404 });
  }

  const userId = new ObjectId(session.sub);
  if (place.createdBy?.equals(userId)) {
    return NextResponse.json({ error: "You can't vote on your own submission." }, { status: 403 });
  }

  const usefulVotes = await getUsefulVotesCollection();
  const existing = await usefulVotes.findOne({ placeId: place._id, userId });
  const transition = computeVoteTransition(existing?.value ?? null, value);
  const now = new Date();

  if (transition.action === "insert") {
    await usefulVotes.insertOne({
      _id: new ObjectId(),
      placeId: place._id,
      userId,
      value,
      createdAt: now,
    });
  } else if (transition.action === "update") {
    await usefulVotes.updateOne({ _id: existing!._id }, { $set: { value, createdAt: now } });
  } else {
    await usefulVotes.deleteOne({ _id: existing!._id });
  }

  const updatedPlace = await places.findOneAndUpdate(
    { _id: place._id },
    {
      $inc: { usefulCount: transition.usefulDelta, notUsefulCount: transition.notUsefulDelta },
      $set: { updatedAt: now },
    },
    { returnDocument: "after" },
  );

  if (transition.usefulVotesReceivedDelta !== 0 && place.createdBy) {
    const users = await getUsersCollection();
    await users.updateOne(
      { _id: place.createdBy },
      { $inc: { "stats.usefulVotesReceived": transition.usefulVotesReceivedDelta } },
    );
  }

  return NextResponse.json({
    yourVote: transition.action === "delete" ? null : value,
    usefulCount: updatedPlace?.usefulCount ?? place.usefulCount,
    notUsefulCount: updatedPlace?.notUsefulCount ?? place.notUsefulCount,
  });
}
