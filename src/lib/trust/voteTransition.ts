export type VoteValue = "useful" | "not_useful";

export interface VoteTransition {
  /** What to do to the useful_votes document. */
  action: "insert" | "update" | "delete";
  /** Delta to apply to places.usefulCount. */
  usefulDelta: number;
  /** Delta to apply to places.notUsefulCount. */
  notUsefulDelta: number;
  /**
   * Delta to apply to the place's contributor's stats.usefulVotesReceived.
   * Only "useful" votes count toward a contributor's received recognition —
   * a not_useful vote never *removes* reputation, it just doesn't add any
   * (see 03-community-and-contributors.md's "reputation is accuracy, not a
   * popularity contest" principle: silence/disagreement isn't punished).
   */
  usefulVotesReceivedDelta: number;
}

/**
 * Pure decision table for POST /api/places/[id]/useful. A user can vote
 * once per place (unique index on placeId+userId), but voting again is a
 * toggle, not an error:
 *   - no existing vote            → insert
 *   - existing vote, same value   → delete (un-vote / toggle off)
 *   - existing vote, other value  → update (switch useful ⇄ not_useful)
 */
export function computeVoteTransition(
  existing: VoteValue | null,
  requested: VoteValue,
): VoteTransition {
  if (existing === null) {
    return {
      action: "insert",
      usefulDelta: requested === "useful" ? 1 : 0,
      notUsefulDelta: requested === "not_useful" ? 1 : 0,
      usefulVotesReceivedDelta: requested === "useful" ? 1 : 0,
    };
  }

  if (existing === requested) {
    return {
      action: "delete",
      usefulDelta: requested === "useful" ? -1 : 0,
      notUsefulDelta: requested === "not_useful" ? -1 : 0,
      usefulVotesReceivedDelta: requested === "useful" ? -1 : 0,
    };
  }

  // Switching from one value to the other.
  return {
    action: "update",
    usefulDelta: requested === "useful" ? 1 : -1,
    notUsefulDelta: requested === "not_useful" ? 1 : -1,
    usefulVotesReceivedDelta: requested === "useful" ? 1 : existing === "useful" ? -1 : 0,
  };
}
