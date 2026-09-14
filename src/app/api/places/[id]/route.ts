import { NextResponse, type NextRequest } from "next/server";
import { ObjectId } from "mongodb";
import { getPlaceById } from "@/lib/places/getPlaceById";
import { getCurrentUser } from "@/lib/auth/session";
import { getPlacesCollection } from "@/lib/db/models/place";
import { getPlaceEditsCollection } from "@/lib/db/models/placeEdit";
import { getUsersCollection } from "@/lib/db/models/user";
import { placeEditInputSchema, type EditablePlaceField } from "@/lib/validation/placeEdit";
import { diffPlaceEdit, applyPlaceEditChanges } from "@/lib/places/diffPlaceEdit";
import { scorePlaceEdit } from "@/lib/trust/spamScore";
import { isCooldownActive, cooldownRemainingMs, SPAM_REJECTION_COOLDOWN_HOURS } from "@/lib/trust/cooldown";
import { EDIT_DAILY_LIMIT, ONE_DAY_MS } from "@/lib/rateLimit/tiers";
import { checkRateLimit } from "@/lib/rateLimit";

/** GET /api/places/[id] — accepts either the Mongo _id or the place's slug. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const place = await getPlaceById(id);

  if (!place) {
    return NextResponse.json({ error: "Place not found" }, { status: 404 });
  }

  return NextResponse.json(place);
}

/**
 * PATCH /api/places/[id] — propose an edit ("suggest a correction").
 * spamScore.ts routes it per §2.2, same as a new place submission but onto
 * place_edits' narrower status enum: low risk auto-approves (the change
 * applies immediately), medium/unscored-differently-for-edits risk goes to
 * the moderation queue as `pending`, and the worst tier auto-rejects with
 * the same account-level submission cooldown a rejected place gets.
 *
 * Only accepts the place's own _id, not its slug — the client already has
 * the resolved id from GET /api/places/[id]'s response by the time it's
 * proposing an edit.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getCurrentUser(request);
  if (!session) {
    return NextResponse.json({ error: "You must be logged in to suggest an edit." }, { status: 401 });
  }

  const userId = new ObjectId(session.sub);
  const users = await getUsersCollection();
  const user = await users.findOne({ _id: userId });
  if (!user || user.accountStatus !== "active") {
    return NextResponse.json({ error: "You must be logged in to suggest an edit." }, { status: 401 });
  }

  if (isCooldownActive(user.submissionCooldownUntil)) {
    const hours = Math.ceil(cooldownRemainingMs(user.submissionCooldownUntil!) / (60 * 60 * 1000));
    return NextResponse.json(
      { error: `Submissions are paused on this account for about ${hours}h more.` },
      { status: 403 },
    );
  }

  const rate = await checkRateLimit({
    key: `edit:${session.sub}`,
    limit: EDIT_DAILY_LIMIT,
    windowMs: ONE_DAY_MS,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: `Daily edit limit reached (${EDIT_DAILY_LIMIT}/day). Try again tomorrow.` },
      { status: 429 },
    );
  }

  const { id } = await params;
  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid place id" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = placeEditInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { reason, ...proposed } = parsed.data;

  const places = await getPlacesCollection();
  const place = await places.findOne({ _id: new ObjectId(id), status: "published" });
  if (!place) {
    return NextResponse.json({ error: "Place not found" }, { status: 404 });
  }

  const changes = diffPlaceEdit(place, proposed as Partial<Record<EditablePlaceField, string>>);
  if (Object.keys(changes).length === 0) {
    return NextResponse.json(
      { error: "That matches what's already published — nothing to change." },
      { status: 400 },
    );
  }

  const proposedFields = proposed as Partial<Record<EditablePlaceField, string>>;
  const { result: spamResult, routing } = await scorePlaceEdit({
    user,
    place,
    proposedName: proposedFields.name,
    proposedDescription: proposedFields.description,
    proposedPhone: proposedFields.phone,
  });

  const placeEdits = await getPlaceEditsCollection();
  const now = new Date();
  const editDoc = {
    _id: new ObjectId(),
    placeId: place._id,
    userId,
    changes,
    reason,
    status: routing,
    spamScore: spamResult.score,
    createdAt: now,
  };
  await placeEdits.insertOne(editDoc);

  if (routing === "approved") {
    await places.updateOne(
      { _id: place._id },
      { $set: { ...applyPlaceEditChanges(changes), updatedAt: now } },
    );
    await users.updateOne({ _id: userId }, { $inc: { "stats.correctionsMade": 1 } });
  } else if (routing === "rejected") {
    await users.updateOne(
      { _id: userId },
      { $set: { submissionCooldownUntil: new Date(now.getTime() + SPAM_REJECTION_COOLDOWN_HOURS * 60 * 60 * 1000) } },
    );
  }

  return NextResponse.json({ id: editDoc._id.toHexString(), status: editDoc.status }, { status: 201 });
}
