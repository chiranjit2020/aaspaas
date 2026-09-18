import { ObjectId } from "mongodb";
import { getPlacePhotosCollection } from "@/lib/db/models/placePhoto";

export interface PhotoSummary {
  id: string;
  url: string;
}

const MAX_GALLERY_PHOTOS = 20;

/** Approved-only, newest first — same "never leak unmoderated content" rule as every other public read. */
export async function getApprovedPhotos(placeId: string): Promise<PhotoSummary[]> {
  const photos = await getPlacePhotosCollection();
  const docs = await photos
    .find({ placeId: new ObjectId(placeId), moderationStatus: "approved" })
    .sort({ uploadedAt: -1 })
    .limit(MAX_GALLERY_PHOTOS)
    .toArray();
  return docs.map((doc) => ({ id: doc._id.toHexString(), url: doc.url }));
}
