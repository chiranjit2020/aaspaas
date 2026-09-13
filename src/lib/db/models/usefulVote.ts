import type { Collection } from "mongodb";
import { getDb } from "@/lib/db/connect";
import type { UsefulVoteDoc } from "@/types/domain";

export const USEFUL_VOTES_COLLECTION = "useful_votes";

export async function getUsefulVotesCollection(): Promise<Collection<UsefulVoteDoc>> {
  const db = await getDb();
  return db.collection<UsefulVoteDoc>(USEFUL_VOTES_COLLECTION);
}
