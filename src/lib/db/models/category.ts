import type { Collection } from "mongodb";
import { getDb } from "@/lib/db/connect";
import type { CategoryDoc } from "@/types/domain";

export const CATEGORIES_COLLECTION = "categories";

export async function getCategoriesCollection(): Promise<Collection<CategoryDoc>> {
  const db = await getDb();
  return db.collection<CategoryDoc>(CATEGORIES_COLLECTION);
}
