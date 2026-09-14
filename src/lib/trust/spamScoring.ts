/**
 * Pure spam-scoring logic — no DB import, so it's cheap to unit test in
 * isolation (same split as duplicateScoring.ts vs. duplicateDetection.ts,
 * for the same reason: a module that statically imports lib/db/connect.ts
 * throws immediately if MONGODB_URI isn't set yet at test-import time).
 * spamScore.ts adds the DB-gathering wrapper on top of this.
 *
 * Per 07-roadmap-and-architecture.md §2.2: "File 06 described a 0-100 spam
 * score... computed server-side inside POST /api/places and the
 * edit-proposal handler." Deterministic, no ML — every point value below is
 * a plain, auditable rule, not a learned weight.
 */
import type { ReputationLevel } from "@/types/domain";

export interface SpamScoreInput {
  /** Age of the submitting account, in days. */
  accountAgeDays: number;
  emailVerified: boolean;
  /** This user's OTHER place submissions in the last 24h (not counting this one). */
  recentSubmissionCount: number;
  /** Highest name-similarity (0-1) among duplicate candidates found for this submission. */
  duplicateSimilarity: number;
  /** True if any duplicate candidate matched on phone number specifically. */
  duplicatePhoneMatch: boolean;
  /** Other places (not this one) already using the same phone number. */
  samePhoneCount: number;
  name: string;
  description?: string;
  phone?: string;
  /** Reports filed (ever) against places this user created. */
  reportsAgainstUser: number;
  reputationLevel: ReputationLevel;
  rejectedSubmissionsCount: number;
  /**
   * True when this locality has prior published/pending places but NONE of
   * them use the submitted pincode — a plausible "made up the address"
   * signal. False (not just "unknown") when there's no prior data to check
   * against — silence isn't suspicious.
   */
  geoInconsistent: boolean;
}

export interface SpamScoreResult {
  score: number; // 0-100, clamped
  reasons: string[]; // human-readable, for the moderation watchlist and tests
}

export type SpamRoutingOutcome = "auto_publish" | "watchlist" | "pending_review" | "rejected_cooldown";

/** §2.2's exact thresholds. */
export function routeBySpamScore(score: number): SpamRoutingOutcome {
  if (score <= 20) return "auto_publish";
  if (score <= 50) return "watchlist";
  if (score <= 75) return "pending_review";
  return "rejected_cooldown";
}

function scoreAccountAge(days: number): { points: number; reason?: string } {
  if (days < 1) return { points: 20, reason: "account created less than a day ago" };
  if (days < 7) return { points: 12, reason: "account less than a week old" };
  if (days < 30) return { points: 5, reason: "account less than a month old" };
  return { points: 0 };
}

function scoreVelocity(recentSubmissionCount: number): { points: number; reason?: string } {
  if (recentSubmissionCount >= 3) {
    return { points: 20, reason: `${recentSubmissionCount} other submissions in the last 24h` };
  }
  if (recentSubmissionCount === 2) return { points: 10, reason: "2 other submissions in the last 24h" };
  if (recentSubmissionCount === 1) return { points: 5, reason: "1 other submission in the last 24h" };
  return { points: 0 };
}

const SPAM_PHRASES = [
  "click here",
  "whatsapp only",
  "limited time",
  "free gift",
  "guaranteed",
  "act now",
  "100% free",
  "cash prize",
  "you have won",
  "best price guaranteed",
  "dm for details",
];

const URL_PATTERN = /https?:\/\/|www\.|\.(com|in|net|org|xyz)\b/i;
const PHONE_LIKE_PATTERN = /(?:\+91[-\s]?)?[6-9]\d{9}\b/g;

function isShoutingCase(text: string): boolean {
  const letters = text.replace(/[^a-zA-Z]/g, "");
  return letters.length >= 6 && letters === letters.toUpperCase();
}

/** ALL CAPS, URL/phone stuffing, known spam phrases — no ML needed for V1. */
export function scoreSuspiciousText(
  name: string,
  description: string | undefined,
  declaredPhone: string | undefined,
): { points: number; reasons: string[] } {
  const reasons: string[] = [];
  let points = 0;
  const combined = `${name} ${description ?? ""}`;

  if (isShoutingCase(name)) {
    points += 10;
    reasons.push("name is written in all caps");
  }

  if (URL_PATTERN.test(combined)) {
    points += 15;
    reasons.push("contains a URL");
  }

  const digitsOnlyPhone = declaredPhone?.replace(/\D/g, "");
  const phoneMatches = description?.match(PHONE_LIKE_PATTERN) ?? [];
  const stuffedPhone = phoneMatches.some((m) => m.replace(/\D/g, "") !== digitsOnlyPhone);
  if (stuffedPhone) {
    points += 10;
    reasons.push("description contains a phone number that doesn't match the listed one");
  }

  const lowerCombined = combined.toLowerCase();
  if (SPAM_PHRASES.some((phrase) => lowerCombined.includes(phrase))) {
    points += 15;
    reasons.push("contains a known spam phrase");
  }

  return { points, reasons };
}

function scoreDuplicateSignal(
  similarity: number,
  phoneMatch: boolean,
): { points: number; reason?: string } {
  const similarityPoints = Math.round(similarity * 25);
  const phonePoints = phoneMatch ? 10 : 0;
  const points = similarityPoints + phonePoints;
  if (points === 0) return { points: 0 };
  return { points, reason: "resembles an existing listing" };
}

function scoreSamePhone(count: number): { points: number; reason?: string } {
  if (count <= 0) return { points: 0 };
  return {
    points: Math.min(count * 15, 30),
    reason: `phone number already used by ${count} other listing${count === 1 ? "" : "s"}`,
  };
}

function scoreReportsAgainstUser(count: number): { points: number; reason?: string } {
  if (count <= 0) return { points: 0 };
  return { points: Math.min(count * 5, 20), reason: `${count} report(s) against this contributor's other places` };
}

function scoreRejectedSubmissions(count: number): { points: number; reason?: string } {
  if (count <= 0) return { points: 0 };
  return { points: Math.min(count * 8, 24), reason: `${count} previously rejected submission(s)` };
}

/** Reputation LOWERS risk — a negative contribution to the score. */
export function reputationAdjustment(level: ReputationLevel): number {
  switch (level) {
    case "local_explorer":
      return -5;
    case "community_scout":
      return -10;
    case "trusted_contributor":
      return -20;
    case "local_guide":
      return -30;
    case "newcomer":
    default:
      return 0;
  }
}

export function computeSpamScore(input: SpamScoreInput): SpamScoreResult {
  const reasons: string[] = [];
  let score = 0;

  const add = (result: { points: number; reason?: string }) => {
    score += result.points;
    if (result.points > 0 && result.reason) reasons.push(result.reason);
  };

  add(scoreAccountAge(input.accountAgeDays));
  if (!input.emailVerified) {
    score += 15;
    reasons.push("email not verified");
  }
  add(scoreVelocity(input.recentSubmissionCount));
  add(scoreDuplicateSignal(input.duplicateSimilarity, input.duplicatePhoneMatch));
  add(scoreSamePhone(input.samePhoneCount));

  const text = scoreSuspiciousText(input.name, input.description, input.phone);
  score += text.points;
  reasons.push(...text.reasons);

  add(scoreReportsAgainstUser(input.reportsAgainstUser));
  add(scoreRejectedSubmissions(input.rejectedSubmissionsCount));

  if (input.geoInconsistent) {
    score += 15;
    reasons.push("pincode doesn't match this locality's known pincodes");
  }

  score += reputationAdjustment(input.reputationLevel);

  return { score: Math.max(0, Math.min(100, score)), reasons };
}
