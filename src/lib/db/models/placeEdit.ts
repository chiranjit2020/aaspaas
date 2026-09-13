import type { Collection } from "mongodb";
import { getDb } from "@/lib/db/connect";
import type { PlaceEditDoc } from "@/types/domain";

export const PLACE_EDITS_COLLECTION = "place_edits";

export async function getPlaceEditsCollection(): Promise<Collection<PlaceEditDoc>> {
  const db = await getDb();
  return db.collection<PlaceEditDoc>(PLACE_EDITS_COLLECTION);
}
