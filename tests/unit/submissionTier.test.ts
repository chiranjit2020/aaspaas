import { describe, expect, it } from "vitest";
import { resolveSubmissionTier, SUBMISSION_LIMITS } from "@/lib/rateLimit/tiers";

describe("resolveSubmissionTier", () => {
  it("restricts an unverified account regardless of age", () => {
    expect(
      resolveSubmissionTier({ emailVerified: false, accountAgeDays: 400, reputationLevel: "newcomer" }),
    ).toBe("restricted");
  });

  it("restricts a verified but brand-new account", () => {
    expect(
      resolveSubmissionTier({ emailVerified: true, accountAgeDays: 2, reputationLevel: "newcomer" }),
    ).toBe("restricted");
  });

  it("promotes a verified, established account to standard", () => {
    expect(
      resolveSubmissionTier({ emailVerified: true, accountAgeDays: 7, reputationLevel: "newcomer" }),
    ).toBe("standard");
  });

  it("promotes a trusted_contributor to trusted even if the account is new and unverified", () => {
    expect(
      resolveSubmissionTier({
        emailVerified: false,
        accountAgeDays: 1,
        reputationLevel: "trusted_contributor",
      }),
    ).toBe("trusted");
  });

  it("promotes a local_guide to trusted", () => {
    expect(
      resolveSubmissionTier({ emailVerified: true, accountAgeDays: 400, reputationLevel: "local_guide" }),
    ).toBe("trusted");
  });

  it("does not promote a community_scout past standard", () => {
    expect(
      resolveSubmissionTier({ emailVerified: true, accountAgeDays: 400, reputationLevel: "community_scout" }),
    ).toBe("standard");
  });
});

describe("SUBMISSION_LIMITS", () => {
  it("matches §2.1's named numbers", () => {
    expect(SUBMISSION_LIMITS.restricted).toBe(3);
    expect(SUBMISSION_LIMITS.standard).toBe(10);
    expect(SUBMISSION_LIMITS.trusted).toBe(25);
  });
});
