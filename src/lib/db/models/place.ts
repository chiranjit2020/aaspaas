import type { Collection } from "mongodb";
import { getDb } from "@/lib/db/connect";
import type { PlaceDoc } from "@/types/domain";

export const PLACES_COLLECTION = "places";

export async function getPlacesCollection(): Promise<Collection<PlaceDoc>> {
  const db = await getDb();
  return db.collection<PlaceDoc>(PLACES_COLLECTION);
}
