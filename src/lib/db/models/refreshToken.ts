import type { Collection } from "mongodb";
import { getDb } from "@/lib/db/connect";
import type { RefreshTokenDoc } from "@/types/domain";

export const REFRESH_TOKENS_COLLECTION = "refresh_tokens";

export async function getRefreshTokensCollection(): Promise<Collection<RefreshTokenDoc>> {
  const db = await getDb();
  return db.collection<RefreshTokenDoc>(REFRESH_TOKENS_COLLECTION);
}
