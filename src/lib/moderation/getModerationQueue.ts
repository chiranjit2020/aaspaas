import { ObjectId } from "mongodb";
import { getPlacesCollection } from "@/lib/db/models/place";
import { getCategoriesCollection } from "@/lib/db/models/category";
import { getUsersCollection } from "@/lib/db/models/user";

/**
 * Shared by GET /api/moderation/queue and the /moderation page — same
 * no-self-fetch pattern as getPlaceById/getPublicProfile.
 *
 * M3 scope only: pending PLACES. place_edits and reports don't exist as
 * collections yet (M4), so there's nothing else to queue.
 */
export interface ModerationQueueItem {
  id: string;
  name: string;
  slug: string;
  category: { name: string; icon: string };
  district: string;
  locality: string;
  pincode: string;
  phone?: string;
  description?: string;
  createdAt: string;
  contributor: { username: string; displayName: string } | null;
  /**
   * Set at submission time when the user proceeded past a duplicate warning
   * (see lib/trust/duplicateDetection.ts) — a hint for the moderator, not a
   * verdict. The moderator still decides approve vs. reject.
   */
  possibleDuplicateOf: { id: string; name: string; slug: string } | null;
}

export async function getModerationQueue(limit = 50): Promise<ModerationQueueItem[]> {
  const places = await getPlacesCollection();
  const pending = await places
    .find({ status: "pending" })
    .sort({ createdAt: 1 }) // oldest first — first in, first reviewed
    .limit(limit)
    .toArray();

  if (pending.length === 0) return [];

  const categoryIds = [...new Set(pending.map((p) => p.categoryId.toHexString()))].map(
    (id) => new ObjectId(id),
  );
  const contributorIds = [
    ...new Set(pending.filter((p) => p.createdBy).map((p) => p.createdBy!.toHexString())),
  ].map((id) => new ObjectId(id));
  const duplicateIds = [
    ...new Set(
      pending.filter((p) => p.duplicateOfPlaceId).map((p) => p.duplicateOfPlaceId!.toHexString()),
    ),
  ].map((id) => new ObjectId(id));

  const [categories, users] = await Promise.all([getCategoriesCollection(), getUsersCollection()]);

  const [categoryDocs, userDocs, duplicateDocs] = await Promise.all([
    categories.find({ _id: { $in: categoryIds } }).toArray(),
    users
      .find({ _id: { $in: contributorIds } }, { projection: { username: 1, displayName: 1 } })
      .toArray(),
    duplicateIds.length > 0
      ? places.find({ _id: { $in: duplicateIds } }, { projection: { name: 1, slug: 1 } }).toArray()
      : Promise.resolve([]),
  ]);

  const categoriesById = new Map(categoryDocs.map((c) => [c._id.toHexString(), c]));
  const usersById = new Map(userDocs.map((u) => [u._id.toHexString(), u]));
  const duplicatesById = new Map(duplicateDocs.map((d) => [d._id.toHexString(), d]));

  return pending.map((doc) => {
    const category = categoriesById.get(doc.categoryId.toHexString());
    const contributor = doc.createdBy ? usersById.get(doc.createdBy.toHexString()) : undefined;
    const duplicate = doc.duplicateOfPlaceId
      ? duplicatesById.get(doc.duplicateOfPlaceId.toHexString())
      : undefined;

    return {
      id: doc._id.toHexString(),
      name: doc.name,
      slug: doc.slug,
      category: { name: category?.name ?? "Unknown", icon: category?.icon ?? "help-circle" },
      district: doc.district,
      locality: doc.locality,
      pincode: doc.pincode,
      phone: doc.phone,
      description: doc.description,
      createdAt: doc.createdAt.toISOString(),
      contributor: contributor
        ? { username: contributor.username, displayName: contributor.displayName }
        : null,
      possibleDuplicateOf: duplicate
        ? { id: duplicate._id.toHexString(), name: duplicate.name, slug: duplicate.slug }
        : null,
    };
  });
}
