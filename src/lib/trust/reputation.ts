/**
 * Where reputation "actually lives" — the one DB-touching module that
 * gathers a user's real signals and hands them to the pure scorer in
 * reputationScoring.ts, then writes the result back if it changed. Same
 * split/shape as spamScore.ts vs. spamScoring.ts.
 *
 * Nothing computed a real reputationLevel before this — every account sat
 * at its registration-time default ("newcomer") forever (see
 * 08-hardening-audit.md §7's explicit note on the deferral). That made two
 * already-shipped features silently inert: the "trusted" submission tier in
 * lib/rateLimit/tiers.ts, and computeSpamScore's reputationAdjustment
 * discount. Neither of those needed to change to "turn on" — they were
 * always reading the real `users.reputationLevel` field, just one that
 * never moved. This module is what starts moving it.
 */
import { ObjectId, type WithId } from "mongodb";
import { getPlacesCollection } from "@/lib/db/models/place";
import { getReportsCollection } from "@/lib/db/models/report";
import { getUsersCollection } from "@/lib/db/models/user";
import type { UserDoc, ReputationLevel } from "@/types/domain";
import { computeReputationLevel } from "./reputationScoring";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

async function countPublishedPlaces(userId: ObjectId): Promise<number> {
  const places = await getPlacesCollection();
  return places.countDocuments({ createdBy: userId, status: "published" });
}

async function countReportsAgainstOwnPlaces(userId: ObjectId): Promise<number> {
  const places = await getPlacesCollection();
  const ownPlaceIds = await places.distinct("_id", { createdBy: userId });
  if (ownPlaceIds.length === 0) return 0;
  const reports = await getReportsCollection();
  return reports.countDocuments({ placeId: { $in: ownPlaceIds } });
}

/**
 * Recomputes one user's reputation level from their current, real signals
 * and writes it if it changed. Call this after any event that moves one of
 * the underlying signals: a place gets published or rejected, a suggested
 * edit gets approved, or a useful vote lands on one of this user's places
 * (see the call sites — moderation approve/reject, moderation edit-approve,
 * and the useful-vote route).
 *
 * Deliberately a full recompute from current totals, not an incremental
 * bump — reputation should reflect current standing, including downward
 * movement if accuracy drops, per 03-community-and-contributors.md's
 * "accuracy, not popularity" rule. Cheap enough at V1 scale (a handful of
 * count queries scoped to one user) to just redo it rather than maintain a
 * separately-drifting running score.
 *
 * NOT wired to every place a report could touch: a report resolved as
 * "removed" doesn't by itself change any counter this reads (there's no
 * "places removed after publication" stat yet) — only the report itself
 * (reportsAgainstOwnPlaces) counts, whether or not it was ever resolved.
 * That's a real, known gap, not an oversight — see REPORT.md.
 */
export async function recomputeReputation(userId: ObjectId): Promise<ReputationLevel | null> {
  const users = await getUsersCollection();
  const user = (await users.findOne({ _id: userId })) as WithId<UserDoc> | null;
  if (!user) return null;

  const [publishedPlaces, reportsAgainstOwnPlaces] = await Promise.all([
    countPublishedPlaces(userId),
    countReportsAgainstOwnPlaces(userId),
  ]);

  const { level } = computeReputationLevel({
    publishedPlaces,
    approvedEdits: user.stats.correctionsMade,
    usefulVotesReceived: user.stats.usefulVotesReceived,
    rejectedSubmissions: user.stats.rejectedSubmissions,
    reportsAgainstOwnPlaces,
    accountAgeDays: (Date.now() - user.createdAt.getTime()) / ONE_DAY_MS,
  });

  if (level !== user.reputationLevel) {
    await users.updateOne({ _id: userId }, { $set: { reputationLevel: level, updatedAt: new Date() } });
  }

  return level;
}
