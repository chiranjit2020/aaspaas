import type { Collection } from "mongodb";
import { getDb } from "@/lib/db/connect";
import type { PlacePhotoDoc } from "@/types/domain";

export const PLACE_PHOTOS_COLLECTION = "place_photos";

export async function getPlacePhotosCollection(): Promise<Collection<PlacePhotoDoc>> {
  const db = await getDb();
  return db.collection<PlacePhotoDoc>(PLACE_PHOTOS_COLLECTION);
}
