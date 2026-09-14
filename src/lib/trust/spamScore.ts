/**
 * Where the spam score "actually lives," per §2.2 — the one DB-touching
 * module that gathers real signals (account age, submission velocity, same-
 * phone reuse, reports against the user, geo consistency) and hands them to
 * the pure scorer in spamScoring.ts, then works out what that score means
 * for a place submission vs. an edit proposal (they land on different
 * status enums — see routeSubmission/routeEdit below).
 */
import { ObjectId, type WithId } from "mongodb";
import { getPlacesCollection } from "@/lib/db/models/place";
import { getReportsCollection } from "@/lib/db/models/report";
import type { PlaceDoc, UserDoc } from "@/types/domain";
import type { DuplicateMatch } from "./duplicateDetection";
import { computeSpamScore, routeBySpamScore, type SpamScoreResult } from "./spamScoring";

export {
  computeSpamScore,
  routeBySpamScore,
  reputationAdjustment,
  scoreSuspiciousText,
  type SpamScoreInput,
  type SpamScoreResult,
  type SpamRoutingOutcome,
} from "./spamScoring";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

async function countRecentSubmissions(userId: ObjectId): Promise<number> {
  const places = await getPlacesCollection();
  return places.countDocuments({
    createdBy: userId,
    createdAt: { $gte: new Date(Date.now() - ONE_DAY_MS) },
  });
}

async function countSamePhone(phone: string | undefined): Promise<number> {
  if (!phone) return 0;
  const places = await getPlacesCollection();
  return places.countDocuments({ phone, status: { $in: ["published", "pending", "flagged"] } });
}

async function countReportsAgainstUser(userId: ObjectId): Promise<number> {
  const places = await getPlacesCollection();
  const ownPlaceIds = await places.distinct("_id", { createdBy: userId });
  if (ownPlaceIds.length === 0) return 0;
  const reports = await getReportsCollection();
  return reports.countDocuments({ placeId: { $in: ownPlaceIds } });
}

/**
 * True only when this locality has prior data AND none of it uses this
 * pincode. No prior data (a brand-new locality) is never flagged — that's
 * "unknown," not "inconsistent."
 */
async function checkGeoInconsistent(locality: string, pincode: string): Promise<boolean> {
  const places = await getPlacesCollection();
  const knownPincodes = await places.distinct("pincode", {
    locality,
    status: { $in: ["published", "pending", "flagged"] },
  });
  return knownPincodes.length > 0 && !knownPincodes.includes(pincode);
}

function accountAgeDays(createdAt: Date): number {
  return (Date.now() - createdAt.getTime()) / ONE_DAY_MS;
}

interface CommonSignals {
  accountAgeDays: number;
  emailVerified: boolean;
  recentSubmissionCount: number;
  reportsAgainstUser: number;
  reputationLevel: UserDoc["reputationLevel"];
  rejectedSubmissionsCount: number;
}

async function gatherCommonSignals(user: WithId<UserDoc>): Promise<CommonSignals> {
  const [recentSubmissionCount, reportsAgainstUser] = await Promise.all([
    countRecentSubmissions(user._id),
    countReportsAgainstUser(user._id),
  ]);
  return {
    accountAgeDays: accountAgeDays(user.createdAt),
    emailVerified: user.emailVerified,
    recentSubmissionCount,
    reportsAgainstUser,
    reputationLevel: user.reputationLevel,
    rejectedSubmissionsCount: user.stats.rejectedSubmissions,
  };
}

export type PlaceSubmissionRouting =
  | { status: "published"; watchlisted: false }
  | { status: "published"; watchlisted: true }
  | { status: "pending"; watchlisted: false }
  | { status: "rejected"; watchlisted: false };

/**
 * Scores a new place submission and works out what its `status` should be.
 * `possibleDuplicates` is the same result POST /api/places already computed
 * for the duplicate-warning flow — reused here instead of re-querying.
 */
export async function scorePlaceSubmission(params: {
  user: WithId<UserDoc>;
  name: string;
  description?: string;
  phone?: string;
  locality: string;
  pincode: string;
  possibleDuplicates: DuplicateMatch[];
}): Promise<{ result: SpamScoreResult; routing: PlaceSubmissionRouting }> {
  const [common, samePhoneCount, geoInconsistent] = await Promise.all([
    gatherCommonSignals(params.user),
    countSamePhone(params.phone),
    checkGeoInconsistent(params.locality, params.pincode),
  ]);

  const duplicateSimilarity = params.possibleDuplicates.reduce(
    (max, m) => Math.max(max, m.nameSimilarity),
    0,
  );
  const duplicatePhoneMatch = params.possibleDuplicates.some((m) => m.phoneMatch);

  const result = computeSpamScore({
    ...common,
    duplicateSimilarity,
    duplicatePhoneMatch,
    samePhoneCount,
    name: params.name,
    description: params.description,
    phone: params.phone,
    geoInconsistent,
  });

  const outcome = routeBySpamScore(result.score);
  const routing: PlaceSubmissionRouting =
    outcome === "auto_publish"
      ? { status: "published", watchlisted: false }
      : outcome === "watchlist"
        ? { status: "published", watchlisted: true }
        : outcome === "pending_review"
          ? { status: "pending", watchlisted: false }
          : { status: "rejected", watchlisted: false };

  return { result, routing };
}

export type PlaceEditRouting = "approved" | "pending" | "rejected";

/**
 * Scores a proposed edit. No duplicate/same-phone/geo signals here — those
 * only make sense when a *new* place is being created, not when correcting
 * an already-vetted one — just the account-level risk factors plus
 * suspicious-text heuristics on whatever text the edit actually touches.
 */
export async function scorePlaceEdit(params: {
  user: WithId<UserDoc>;
  place: WithId<PlaceDoc>;
  proposedName?: string;
  proposedDescription?: string;
  proposedPhone?: string;
}): Promise<{ result: SpamScoreResult; routing: PlaceEditRouting }> {
  const common = await gatherCommonSignals(params.user);

  const result = computeSpamScore({
    ...common,
    duplicateSimilarity: 0,
    duplicatePhoneMatch: false,
    samePhoneCount: 0,
    name: params.proposedName ?? params.place.name,
    description: params.proposedDescription ?? params.place.description,
    phone: params.proposedPhone ?? params.place.phone,
    geoInconsistent: false,
  });

  const outcome = routeBySpamScore(result.score);
  const routing: PlaceEditRouting =
    outcome === "auto_publish" ? "approved" : outcome === "rejected_cooldown" ? "rejected" : "pending";

  return { result, routing };
}
