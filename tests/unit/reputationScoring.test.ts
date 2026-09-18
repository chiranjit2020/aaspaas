import { describe, expect, it } from "vitest";
import {
  computeReputationScore,
  computeReputationLevel,
  type ReputationInput,
} from "@/lib/trust/reputationScoring";

const ZERO_INPUT: ReputationInput = {
  publishedPlaces: 0,
  approvedEdits: 0,
  usefulVotesReceived: 0,
  rejectedSubmissions: 0,
  reportsAgainstOwnPlaces: 0,
  accountAgeDays: 0,
};

describe("computeReputationScore", () => {
  it("is 0 for a brand-new account with no activity", () => {
    expect(computeReputationScore(ZERO_INPUT)).toBe(0);
  });

  it("rewards published places more than approved edits", () => {
    const fromPlace = computeReputationScore({ ...ZERO_INPUT, publishedPlaces: 1 });
    const fromEdit = computeReputationScore({ ...ZERO_INPUT, approvedEdits: 1 });
    expect(fromPlace).toBeGreaterThan(fromEdit);
  });

  it("log-scales useful votes so raw vote count can't dominate published places", () => {
    // 500 useful votes vs. 10 published places — volume alone must not win,
    // per 03-community-and-contributors.md's "accuracy, not popularity" rule.
    const voteHeavy = computeReputationScore({ ...ZERO_INPUT, usefulVotesReceived: 500 });
    const placeHeavy = computeReputationScore({ ...ZERO_INPUT, publishedPlaces: 10 });
    expect(placeHeavy).toBeGreaterThan(voteHeavy);
  });

  it("never goes negative even with heavy penalties and no positive signal", () => {
    expect(
      computeReputationScore({ ...ZERO_INPUT, rejectedSubmissions: 50, reportsAgainstOwnPlaces: 50 }),
    ).toBe(0);
  });

  it("a rejection costs more than one published place earns", () => {
    const onePlace = computeReputationScore({ ...ZERO_INPUT, publishedPlaces: 1 });
    const onePlaceOneRejection = computeReputationScore({
      ...ZERO_INPUT,
      publishedPlaces: 1,
      rejectedSubmissions: 1,
    });
    expect(onePlaceOneRejection).toBeLessThan(onePlace);
  });
});

describe("computeReputationLevel", () => {
  it("defaults to newcomer with no activity", () => {
    expect(computeReputationLevel(ZERO_INPUT).level).toBe("newcomer");
  });

  it("stays newcomer on a high score if the account is too new (minimum-tenure gate)", () => {
    const result = computeReputationLevel({
      ...ZERO_INPUT,
      publishedPlaces: 20,
      accountAgeDays: 1, // one day old, no matter how much they've done today
    });
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.level).toBe("newcomer");
  });

  it("promotes to local_explorer once score and tenure both clear the bar", () => {
    const result = computeReputationLevel({ ...ZERO_INPUT, publishedPlaces: 3, accountAgeDays: 10 });
    expect(result.level).toBe("local_explorer");
  });

  it("promotes to community_scout at the higher score/tenure bar", () => {
    const result = computeReputationLevel({ ...ZERO_INPUT, publishedPlaces: 7, accountAgeDays: 25 });
    expect(result.level).toBe("community_scout");
  });

  it("promotes to trusted_contributor only with a clean rejection record", () => {
    const dirty = computeReputationLevel({
      ...ZERO_INPUT,
      publishedPlaces: 15,
      accountAgeDays: 50,
      rejectedSubmissions: 1,
    });
    const clean = computeReputationLevel({
      ...ZERO_INPUT,
      publishedPlaces: 15,
      accountAgeDays: 50,
      rejectedSubmissions: 0,
    });
    expect(dirty.level).not.toBe("trusted_contributor");
    expect(clean.level).toBe("trusted_contributor");
  });

  it("promotes to local_guide at the top bar with a clean record and long tenure", () => {
    const result = computeReputationLevel({ ...ZERO_INPUT, publishedPlaces: 26, accountAgeDays: 95 });
    expect(result.level).toBe("local_guide");
  });

  it("a single rejection can pull a high-scoring account back out of the top tiers", () => {
    const withoutRejection = computeReputationLevel({
      ...ZERO_INPUT,
      publishedPlaces: 26,
      accountAgeDays: 95,
    });
    const withRejection = computeReputationLevel({
      ...ZERO_INPUT,
      publishedPlaces: 26,
      accountAgeDays: 95,
      rejectedSubmissions: 1,
    });
    expect(withoutRejection.level).toBe("local_guide");
    expect(withRejection.level).not.toBe("local_guide");
    expect(withRejection.level).not.toBe("trusted_contributor");
  });
});
