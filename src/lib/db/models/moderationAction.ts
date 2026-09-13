import type { Collection } from "mongodb";
import { getDb } from "@/lib/db/connect";
import type { ModerationActionDoc } from "@/types/domain";

export const MODERATION_ACTIONS_COLLECTION = "moderation_actions";

export async function getModerationActionsCollection(): Promise<Collection<ModerationActionDoc>> {
  const db = await getDb();
  return db.collection<ModerationActionDoc>(MODERATION_ACTIONS_COLLECTION);
}
