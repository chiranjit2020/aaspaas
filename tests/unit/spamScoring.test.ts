import { describe, expect, it } from "vitest";
import {
  computeSpamScore,
  reputationAdjustment,
  routeBySpamScore,
  scoreSuspiciousText,
  type SpamScoreInput,
} from "@/lib/trust/spamScoring";

const CLEAN_INPUT: SpamScoreInput = {
  accountAgeDays: 400,
  emailVerified: true,
  recentSubmissionCount: 0,
  duplicateSimilarity: 0,
  duplicatePhoneMatch: false,
  samePhoneCount: 0,
  name: "Sri Mobile Point",
  description: "Screen repair and battery replacement, walk-ins welcome.",
  phone: "9830000000",
  reportsAgainstUser: 0,
  reputationLevel: "newcomer",
  rejectedSubmissionsCount: 0,
  geoInconsistent: false,
};

describe("routeBySpamScore", () => {
  it.each([
    [0, "auto_publish"],
    [20, "auto_publish"],
    [21, "watchlist"],
    [50, "watchlist"],
    [51, "pending_review"],
    [75, "pending_review"],
    [76, "rejected_cooldown"],
    [100, "rejected_cooldown"],
  ] as const)("routes score %i to %s", (score, outcome) => {
    expect(routeBySpamScore(score)).toBe(outcome);
  });
});

describe("scoreSuspiciousText", () => {
  it("scores clean text as 0", () => {
    const result = scoreSuspiciousText("Sri Mobile Point", "Screen repair", "9830000000");
    expect(result.points).toBe(0);
    expect(result.reasons).toEqual([]);
  });

  it("flags an ALL CAPS name", () => {
    const result = scoreSuspiciousText("SRI MOBILE POINT", undefined, undefined);
    expect(result.points).toBeGreaterThanOrEqual(10);
    expect(result.reasons.some((r) => r.includes("all caps"))).toBe(true);
  });

  it("does not flag a short name for caps (avoids false positives on acronyms)", () => {
    const result = scoreSuspiciousText("KFC", undefined, undefined);
    expect(result.reasons.some((r) => r.includes("all caps"))).toBe(false);
  });

  it("flags a URL in the description", () => {
    const result = scoreSuspiciousText("Sri Mobile Point", "Visit www.example.com for offers", undefined);
    expect(result.reasons.some((r) => r.includes("URL"))).toBe(true);
  });

  it("flags a stuffed phone number that doesn't match the declared one", () => {
    const result = scoreSuspiciousText("Sri Mobile Point", "Call us at 9123456789 for a deal", "9830000000");
    expect(result.reasons.some((r) => r.includes("phone number"))).toBe(true);
  });

  it("does not flag the declared phone number repeated in the description", () => {
    const result = scoreSuspiciousText("Sri Mobile Point", "Call 9830000000 anytime", "9830000000");
    expect(result.reasons.some((r) => r.includes("phone number"))).toBe(false);
  });

  it("flags a known spam phrase", () => {
    const result = scoreSuspiciousText("Sri Mobile Point", "100% free gift, click here now!", undefined);
    expect(result.reasons.some((r) => r.includes("spam phrase"))).toBe(true);
  });
});

describe("reputationAdjustment", () => {
  it("gives newcomers no adjustment", () => {
    expect(reputationAdjustment("newcomer")).toBe(0);
  });

  it("lowers risk more for higher reputation levels", () => {
    const levels = ["newcomer", "local_explorer", "community_scout", "trusted_contributor", "local_guide"] as const;
    const adjustments = levels.map(reputationAdjustment);
    for (let i = 1; i < adjustments.length; i++) {
      expect(adjustments[i]).toBeLessThan(adjustments[i - 1]);
    }
  });
});

describe("computeSpamScore", () => {
  it("scores a clean, established, verified newcomer submission low enough to auto-publish", () => {
    const result = computeSpamScore(CLEAN_INPUT);
    expect(result.score).toBeLessThanOrEqual(20);
    expect(routeBySpamScore(result.score)).toBe("auto_publish");
  });

  it("scores a brand-new unverified account's rapid-fire, spammy submission into rejection", () => {
    const result = computeSpamScore({
      ...CLEAN_INPUT,
      accountAgeDays: 0,
      emailVerified: false,
      recentSubmissionCount: 4,
      duplicateSimilarity: 0.9,
      duplicatePhoneMatch: true,
      samePhoneCount: 3,
      name: "BEST DEALS EVER",
      description: "100% free gift, click here now! Call 9999999999 www.spam.com",
      phone: "9830000000",
      reportsAgainstUser: 5,
      rejectedSubmissionsCount: 4,
      geoInconsistent: true,
    });
    expect(result.score).toBe(100); // clamped
    expect(routeBySpamScore(result.score)).toBe("rejected_cooldown");
    expect(result.reasons.length).toBeGreaterThan(5);
  });

  it("never returns a score below 0 even with maximum reputation offset", () => {
    const result = computeSpamScore({ ...CLEAN_INPUT, reputationLevel: "local_guide" });
    expect(result.score).toBeGreaterThanOrEqual(0);
  });

  it("a trusted contributor's borderline-new account still scores low thanks to the reputation offset", () => {
    const result = computeSpamScore({
      ...CLEAN_INPUT,
      accountAgeDays: 3, // otherwise +12
      reputationLevel: "trusted_contributor", // -20
    });
    expect(result.score).toBe(0);
  });

  it("puts a middling-risk submission (some signals, not extreme) into the watchlist band", () => {
    const result = computeSpamScore({
      ...CLEAN_INPUT,
      accountAgeDays: 5, // +12
      emailVerified: true,
      recentSubmissionCount: 1, // +5
      samePhoneCount: 1, // +15
    });
    expect(result.score).toBe(32);
    expect(routeBySpamScore(result.score)).toBe("watchlist");
  });

  it("does not penalize an unknown locality's pincode when there's no prior data (geoInconsistent: false)", () => {
    const result = computeSpamScore({ ...CLEAN_INPUT, geoInconsistent: false });
    expect(result.reasons.some((r) => r.includes("pincode"))).toBe(false);
  });
});
