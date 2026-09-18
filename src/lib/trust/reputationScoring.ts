/**
 * Pure reputation-level scoring — no DB import, same split as
 * spamScoring.ts/spamScore.ts and duplicateScoring.ts/duplicateDetection.ts,
 * and for the identical reason: cheap to unit test, and importable at
 * test-module-load time without MONGODB_URI being set yet. reputation.ts
 * adds the DB-gathering wrapper on top of this.
 *
 * No formula for this existed anywhere in the planning docs — M4 explicitly
 * deferred it ("no formula exists anywhere in the planning docs"; see
 * 08-hardening-audit.md §7) rather than invent one under a hardening pass.
 * This is that formula, designed against 03-community-and-contributors.md's
 * one hard constraint: **"Trust Score ≠ Number of submissions" — reputation
 * must reward accuracy, not raw volume.** ("A contributor who adds 20
 * excellent shops should be more trusted than someone who adds 2,000 garbage
 * listings.")
 *
 * Deterministic and additive, same philosophy as computeSpamScore: every
 * point is a plain, auditable rule, not a learned weight.
 */
import type { ReputationLevel } from "@/types/domain";

export interface ReputationInput {
  /** Live count of this user's places currently `status: "published"` —
   * NOT stats.placesAdded, which counts every submission attempt including
   * pending/rejected ones. Only work that actually made it into the
   * directory counts toward trust. */
  publishedPlaces: number;
  /** stats.correctionsMade — already only increments when a moderator
   * approves a suggested edit (never on proposal), so this is already an
   * "accuracy" signal, not a volume one. */
  approvedEdits: number;
  /** stats.usefulVotesReceived — net useful votes from OTHER users on this
   * contributor's places. */
  usefulVotesReceived: number;
  /** stats.rejectedSubmissions — a place submission a moderator rejected,
   * OR the spam-score router auto-rejecting one outright. The single
   * strongest "this account submits bad content" signal available. */
  rejectedSubmissions: number;
  /** Reports filed (by anyone) against places this user created — a second,
   * independent accuracy signal: even a *published* place can turn out to
   * be wrong/closed/spam once real people encounter it. */
  reportsAgainstOwnPlaces: number;
  /** Age of the account, in days. */
  accountAgeDays: number;
}

export interface ReputationResult {
  score: number; // >= 0, unbounded above
  level: ReputationLevel;
}

/**
 * Points per unit. Published places (4) outweigh approved edits (2) —
 * starting something new is worth more than correcting something that
 * exists, but both are real, moderator-vetted contributions, not raw
 * submission attempts. usefulVotesReceived is log-scaled for the same
 * reason rank.ts log-scales usefulCount in search ranking: a popular
 * contributor with 500 useful votes shouldn't out-earn 50 published,
 * moderator-approved places purely on vote count.
 */
const POINTS_PER_PUBLISHED_PLACE = 4;
const POINTS_PER_APPROVED_EDIT = 2;
const POINTS_PER_LOG_USEFUL_VOTE = 3;

/**
 * Penalties. Weighted heavier than the positive signals they offset — per
 * the "accuracy, not popularity" rule, one rejection should cost more than
 * one published place earns, so volume alone can never outrun a bad
 * accuracy record.
 */
const PENALTY_PER_REJECTED_SUBMISSION = 6;
const PENALTY_PER_REPORT_AGAINST = 4;

export function computeReputationScore(input: ReputationInput): number {
  const positive =
    input.publishedPlaces * POINTS_PER_PUBLISHED_PLACE +
    input.approvedEdits * POINTS_PER_APPROVED_EDIT +
    Math.log(input.usefulVotesReceived + 1) * POINTS_PER_LOG_USEFUL_VOTE;

  const negative =
    input.rejectedSubmissions * PENALTY_PER_REJECTED_SUBMISSION +
    input.reportsAgainstOwnPlaces * PENALTY_PER_REPORT_AGAINST;

  // Floor at 0 — a bad accuracy record can cost everything this account has
  // earned, but reputation is never negative (there's no such thing as
  // "less trusted than a brand-new account").
  return Math.max(0, Math.round(positive - negative));
}

interface LevelThreshold {
  level: ReputationLevel;
  minScore: number;
  /** A minimum-tenure gate on top of the score, so one lucky burst of
   * activity can't vault a day-old account to the top tier — trust also
   * requires having stuck around. */
  minAccountAgeDays: number;
  /**
   * Local Guide and Trusted Contributor unlock real privileges (fast-track
   * publishing today; community-verification privileges are a named future
   * hook in 03-community-and-contributors.md) — those two require a clean
   * record, not just a high score. A high-volume account that also
   * accumulates rejections can mathematically claw its score back up, but
   * it can never re-enter the two tiers that matter for trust until it has
   * zero rejections on record.
   */
  requireNoRejections?: boolean;
}

// Checked top-down — the first (highest) tier whose gates are all satisfied
// wins. Every account starts at (and falls back to) "newcomer".
const LEVEL_THRESHOLDS: LevelThreshold[] = [
  { level: "local_guide", minScore: 100, minAccountAgeDays: 90, requireNoRejections: true },
  { level: "trusted_contributor", minScore: 50, minAccountAgeDays: 45, requireNoRejections: true },
  { level: "community_scout", minScore: 25, minAccountAgeDays: 21 },
  { level: "local_explorer", minScore: 10, minAccountAgeDays: 7 },
];

export function computeReputationLevel(input: ReputationInput): ReputationResult {
  const score = computeReputationScore(input);

  for (const tier of LEVEL_THRESHOLDS) {
    const meetsScore = score >= tier.minScore;
    const meetsAge = input.accountAgeDays >= tier.minAccountAgeDays;
    const meetsRecord = !tier.requireNoRejections || input.rejectedSubmissions === 0;
    if (meetsScore && meetsAge && meetsRecord) {
      return { score, level: tier.level };
    }
  }

  return { score, level: "newcomer" };
}
