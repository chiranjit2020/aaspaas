import { ObjectId } from "mongodb";
import { getUsefulVotesCollection } from "@/lib/db/models/usefulVote";
import type { UsefulVoteDoc } from "@/types/domain";

/**
 * Server-side lookup so the place detail page can render "you already
 * voted useful" state on first paint, without a client-side round trip.
 * Deliberately separate from getPlaceById — this is per-viewer data and
 * must never leak into the cacheable public place shape.
 */
export async function getUserVoteForPlace(
  placeId: string,
  userId: string,
): Promise<UsefulVoteDoc["value"] | null> {
  const usefulVotes = await getUsefulVotesCollection();
  const vote = await usefulVotes.findOne({
    placeId: new ObjectId(placeId),
    userId: new ObjectId(userId),
  });
  return vote?.value ?? null;
}
