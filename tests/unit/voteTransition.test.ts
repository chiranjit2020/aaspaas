import { describe, expect, it } from "vitest";
import { computeVoteTransition } from "@/lib/trust/voteTransition";

describe("computeVoteTransition", () => {
  it("inserts a fresh useful vote", () => {
    expect(computeVoteTransition(null, "useful")).toEqual({
      action: "insert",
      usefulDelta: 1,
      notUsefulDelta: 0,
      usefulVotesReceivedDelta: 1,
    });
  });

  it("inserts a fresh not_useful vote without touching reputation", () => {
    expect(computeVoteTransition(null, "not_useful")).toEqual({
      action: "insert",
      usefulDelta: 0,
      notUsefulDelta: 1,
      usefulVotesReceivedDelta: 0,
    });
  });

  it("toggles off a repeated useful vote", () => {
    expect(computeVoteTransition("useful", "useful")).toEqual({
      action: "delete",
      usefulDelta: -1,
      notUsefulDelta: 0,
      usefulVotesReceivedDelta: -1,
    });
  });

  it("toggles off a repeated not_useful vote", () => {
    expect(computeVoteTransition("not_useful", "not_useful")).toEqual({
      action: "delete",
      usefulDelta: 0,
      notUsefulDelta: -1,
      usefulVotesReceivedDelta: 0,
    });
  });

  it("switches not_useful to useful, granting reputation", () => {
    expect(computeVoteTransition("not_useful", "useful")).toEqual({
      action: "update",
      usefulDelta: 1,
      notUsefulDelta: -1,
      usefulVotesReceivedDelta: 1,
    });
  });

  it("switches useful to not_useful, revoking reputation", () => {
    expect(computeVoteTransition("useful", "not_useful")).toEqual({
      action: "update",
      usefulDelta: -1,
      notUsefulDelta: 1,
      usefulVotesReceivedDelta: -1,
    });
  });
});
