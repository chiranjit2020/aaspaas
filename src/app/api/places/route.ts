import { NextResponse, type NextRequest } from "next/server";
import { ObjectId } from "mongodb";
import { parseSearchQuery } from "@/lib/validation/search";
import { searchPlaces } from "@/lib/search/service";
import { getCurrentUser } from "@/lib/auth/session";
import { placeInputSchema } from "@/lib/validation/place";
import { getPlacesCollection } from "@/lib/db/models/place";
import { getCategoriesCollection } from "@/lib/db/models/category";
import { getUsersCollection } from "@/lib/db/models/user";
import { makeUniquePlaceSlug } from "@/lib/places/slugify";
import { findPossibleDuplicates } from "@/lib/trust/duplicateDetection";
import { scorePlaceSubmission } from "@/lib/trust/spamScore";
import { isCooldownActive, cooldownRemainingMs, SPAM_REJECTION_COOLDOWN_HOURS } from "@/lib/trust/cooldown";
import { resolveSubmissionTier, SUBMISSION_LIMITS, ONE_DAY_MS } from "@/lib/rateLimit/tiers";
import { checkRateLimit } from "@/lib/rateLimit";
import { getClientIp } from "@/lib/http/clientIp";
import type { PlaceDoc } from "@/types/domain";

/**
 * GET /api/places — browse/list, i.e. search with no free-text term.
 * §2.1: "Anonymous reads: 60 requests/min/IP."
 */
export async function GET(request: NextRequest) {
  const rate = await checkRateLimit({
    key: `read:${getClientIp(request)}`,
    limit: 60,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json({ error: "Too many requests. Slow down and try again shortly." }, { status: 429 });
  }

  const parsed = parseSearchQuery(request.nextUrl.searchParams);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query", issues: parsed.issues }, { status: 400 });
  }

  const { district, locality, pincode, category, cursor, limit } = parsed.data;
  const result = await searchPlaces({ district, locality, pincode, categorySlug: category, cursor, limit });
  return NextResponse.json(result);
}

/**
 * POST /api/places — submit a new place. Requires a session (any logged-in
 * contributor — "verified user" in the roadmap's API table means
 * "authenticated", not "email-verified"; the tiered submission limits in
 * §2.1 explicitly allow unverified accounts a (lower) daily quota).
 *
 * Status is no longer always `pending` — spamScore.ts routes it per §2.2:
 * low risk auto-publishes, medium risk publishes onto the moderator
 * watchlist, high risk goes to the moderation queue, and the worst tier is
 * rejected outright with a submission cooldown. The score itself never
 * bans/suspends an account — only a moderator action does that.
 */
export async function POST(request: NextRequest) {
  const session = await getCurrentUser(request);
  if (!session) {
    return NextResponse.json({ error: "You must be logged in to add a place." }, { status: 401 });
  }

  const userId = new ObjectId(session.sub);
  const users = await getUsersCollection();
  const user = await users.findOne({ _id: userId });
  if (!user || user.accountStatus !== "active") {
    return NextResponse.json({ error: "You must be logged in to add a place." }, { status: 401 });
  }

  if (isCooldownActive(user.submissionCooldownUntil)) {
    const hours = Math.ceil(cooldownRemainingMs(user.submissionCooldownUntil!) / (60 * 60 * 1000));
    return NextResponse.json(
      { error: `Submissions are paused on this account for about ${hours}h more.` },
      { status: 403 },
    );
  }

  const tier = resolveSubmissionTier({
    emailVerified: user.emailVerified,
    accountAgeDays: (Date.now() - user.createdAt.getTime()) / ONE_DAY_MS,
    reputationLevel: user.reputationLevel,
  });
  const rate = await checkRateLimit({
    key: `place-submit:${session.sub}`,
    limit: SUBMISSION_LIMITS[tier],
    windowMs: ONE_DAY_MS,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: `Daily submission limit reached (${SUBMISSION_LIMITS[tier]}/day). Try again tomorrow.` },
      { status: 429 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = placeInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const input = parsed.data;

  const categories = await getCategoriesCollection();
  const category = await categories.findOne({ slug: input.categorySlug });
  if (!category) {
    return NextResponse.json({ error: "Unknown category." }, { status: 400 });
  }

  // §2's "Fake/duplicate places" mitigation: surfaced to the submitter
  // *before* creation. First attempt (no acknowledgeDuplicates) gets a 409
  // with the candidates instead of a created place; the client shows a
  // warning and, if the user picks "create it anyway," resubmits with
  // acknowledgeDuplicates: true.
  const possibleDuplicates = await findPossibleDuplicates({
    name: input.name,
    locality: input.locality,
    lat: input.lat,
    lng: input.lng,
    phone: input.phone,
  });
  if (possibleDuplicates.length > 0 && !input.acknowledgeDuplicates) {
    return NextResponse.json({ possibleDuplicates }, { status: 409 });
  }

  const { result: spamResult, routing } = await scorePlaceSubmission({
    user,
    name: input.name,
    description: input.description,
    phone: input.phone,
    locality: input.locality,
    pincode: input.pincode,
    possibleDuplicates,
  });

  const places = await getPlacesCollection();
  const slug = await makeUniquePlaceSlug(places, input.name);
  const now = new Date();

  const doc: PlaceDoc = {
    _id: new ObjectId(),
    name: input.name,
    slug,
    categoryId: category._id,
    description: input.description,
    phone: input.phone,
    district: input.district,
    locality: input.locality,
    pincode: input.pincode,
    location: { type: "Point", coordinates: [input.lng, input.lat] },
    address: input.address,
    createdBy: userId,
    ownerId: null,
    status: routing.status,
    spamScore: spamResult.score,
    spamReasons: spamResult.reasons,
    verificationCount: 0,
    usefulCount: 0,
    notUsefulCount: 0,
    // A hint for the moderator queue, not a verdict — set only when the user
    // proceeded past a warning about this exact candidate.
    duplicateOfPlaceId: possibleDuplicates.length > 0 ? new ObjectId(possibleDuplicates[0].id) : null,
    tier: "free",
    createdAt: now,
    updatedAt: now,
  };

  await places.insertOne(doc);
  await users.updateOne({ _id: userId }, { $inc: { "stats.placesAdded": 1 } });

  if (routing.status === "rejected") {
    await users.updateOne(
      { _id: userId },
      { $set: { submissionCooldownUntil: new Date(now.getTime() + SPAM_REJECTION_COOLDOWN_HOURS * 60 * 60 * 1000) } },
    );
    return NextResponse.json(
      {
        id: doc._id.toHexString(),
        slug: doc.slug,
        status: doc.status,
        error: "This submission was rejected and couldn't be published.",
      },
      { status: 201 },
    );
  }

  return NextResponse.json({ id: doc._id.toHexString(), slug: doc.slug, status: doc.status }, { status: 201 });
}
