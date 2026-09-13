import type { Collection } from "mongodb";
import { getDb } from "@/lib/db/connect";
import type { UserDoc } from "@/types/domain";

export const USERS_COLLECTION = "users";

export async function getUsersCollection(): Promise<Collection<UserDoc>> {
  const db = await getDb();
  return db.collection<UserDoc>(USERS_COLLECTION);
}
