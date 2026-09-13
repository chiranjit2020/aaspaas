import { ObjectId } from "mongodb";
import { getPlacesCollection } from "@/lib/db/models/place";
import { getCategoriesCollection } from "@/lib/db/models/category";
import { getUsersCollection } from "@/lib/db/models/user";
import { toPlaceDetail } from "@/lib/db/serialize";
import type { PlaceDetail } from "@/types/domain";

/**
 * Shared by GET /api/places/[id] and the place detail server component, so a
 * server-rendered page doesn't have to round-trip through its own API route.
 * Accepts either the Mongo _id or the place's slug.
 */
export async function getPlaceById(id: string): Promise<PlaceDetail | null> {
  const places = await getPlacesCollection();

  const doc = ObjectId.isValid(id)
    ? await places.findOne({ _id: new ObjectId(id), status: "published" })
    : await places.findOne({ slug: id, status: "published" });

  if (!doc) return null;

  const categories = await getCategoriesCollection();
  const category = await categories.findOne({ _id: doc.categoryId });

  let contributor = null;
  if (doc.createdBy) {
    const users = await getUsersCollection();
    const user = await users.findOne(
      { _id: doc.createdBy },
      { projection: { username: 1, displayName: 1 } },
    );
    if (user) contributor = { username: user.username, displayName: user.displayName };
  }

  return toPlaceDetail(doc, category ?? undefined, contributor);
}
