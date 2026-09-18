/**
 * Pure policy for §2.1's rate-limit tiers — no DB import, kept separate from
 * lib/rateLimit/index.ts's Mongo-counter mechanics so the *policy* (who gets
 * how many submissions) is unit-testable independent of the *enforcement*
 * (the counter itself).
 *
 * §2.1 names three place-submission tiers but only fully specifies the
 * bottom one ("Unverified / <7 days old: 3/day") and the top one ("Trusted
 * Contributor+: 25/day"). The middle tier's condition is read from context:
 * "Verified, Local Explorer+" is the *complement* of the bottom tier's two
 * red flags (unverified OR <7 days old) — i.e. verified AND >=7 days old —
 * rather than a strict gate on reputationLevel.
 *
 * That was originally because no milestone through M4 computed a real
 * reputationLevel at all (every account sat at "newcomer" forever). As of
 * 2026-09-15 (see lib/trust/reputation.ts) reputation levels ARE real and do
 * move — but this middle tier deliberately still uses the age/verified
 * proxy rather than switching to a `reputationLevel === "local_explorer"`
 * gate: doing so would instantly change who qualifies for standard vs.
 * restricted limits for every existing account the moment reputation
 * computation shipped, which is exactly the kind of surprise behavior
 * change a rate-limit tier shouldn't get as a side effect of an unrelated
 * feature. Revisiting the middle tier's condition is a deliberate call to
 * make later, not a bug to fix now.
 *
 * The top (`trusted`) tier IS reputationLevel-gated, and was always wired up
 * for real — it started actually selecting real users the moment reputation
 * computation shipped, no change needed here.
 */
import type { ReputationLevel } from "@/types/domain";

export type SubmissionTier = "restricted" | "standard" | "trusted";

export interface SubmissionTierInput {
  emailVerified: boolean;
  accountAgeDays: number;
  reputationLevel: ReputationLevel;
}

const TRUSTED_REPUTATION_LEVELS: ReputationLevel[] = ["trusted_contributor", "local_guide"];

export function resolveSubmissionTier(input: SubmissionTierInput): SubmissionTier {
  if (TRUSTED_REPUTATION_LEVELS.includes(input.reputationLevel)) return "trusted";
  if (input.emailVerified && input.accountAgeDays >= 7) return "standard";
  return "restricted";
}

/** Place submissions per day, per tier. */
export const SUBMISSION_LIMITS: Record<SubmissionTier, number> = {
  restricted: 3,
  standard: 10,
  trusted: 25,
};

// §2.1 gives these caps only under the "Unverified / <7 days old" row and
// never revises them upward for later tiers — read as flat daily ceilings
// for everyone, generous enough that a legitimate active contributor is
// very unlikely to hit them.
export const EDIT_DAILY_LIMIT = 10;
export const VOTE_DAILY_LIMIT = 20;
export const REPORT_DAILY_LIMIT = 5;
export const PHOTO_UPLOAD_DAILY_LIMIT = 10;

/** Per-place ceiling on pending+approved photos — keeps a gallery from being spam-flooded. */
export const MAX_PHOTOS_PER_PLACE = 12;

export const ANONYMOUS_READ_LIMIT_PER_MINUTE = 60;
export const ONE_DAY_MS = 24 * 60 * 60 * 1000;
export const ONE_MINUTE_MS = 60 * 1000;
