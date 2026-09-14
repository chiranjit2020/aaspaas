import { ObjectId } from "mongodb";
import { getPlacesCollection } from "@/lib/db/models/place";
import { getCategoriesCollection } from "@/lib/db/models/category";
import { getUsersCollection } from "@/lib/db/models/user";
import { getPlaceEditsCollection } from "@/lib/db/models/placeEdit";
import { getReportsCollection } from "@/lib/db/models/report";
import type { PlaceEditDoc, ReportReason } from "@/types/domain";

/**
 * Shared by GET /api/moderation/queue and the /moderation page — same
 * no-self-fetch pattern as getPlaceById/getPublicProfile.
 *
 * M4 adds pending place_edits and open reports alongside M3's pending
 * places — all three are moderator work items, just different shapes.
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

export interface EditQueueItem {
  id: string;
  place: { id: string; name: string; slug: string };
  changes: PlaceEditDoc["changes"];
  reason?: string;
  createdAt: string;
  contributor: { username: string; displayName: string } | null;
}

export interface ReportQueueItem {
  id: string;
  place: { id: string; name: string; slug: string };
  reason: ReportReason;
  details?: string;
  createdAt: string;
  contributor: { username: string; displayName: string } | null;
}

export interface WatchlistItem {
  id: string;
  name: string;
  slug: string;
  category: { name: string; icon: string };
  district: string;
  locality: string;
  pincode: string;
  createdAt: string;
  contributor: { username: string; displayName: string } | null;
  spamScore: number;
  spamReasons: string[];
}

export interface ModerationQueue {
  places: ModerationQueueItem[];
  edits: EditQueueItem[];
  reports: ReportQueueItem[];
  watchlist: WatchlistItem[];
}

export async function getModerationQueue(limit = 50): Promise<ModerationQueue> {
  const [places, edits, reports, watchlist] = await Promise.all([
    getPendingPlaces(limit),
    getPendingEdits(limit),
    getOpenReports(limit),
    getWatchlist(limit),
  ]);
  return { places, edits, reports, watchlist };
}

async function getPendingPlaces(limit: number): Promise<ModerationQueueItem[]> {
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

async function getPendingEdits(limit: number): Promise<EditQueueItem[]> {
  const placeEdits = await getPlaceEditsCollection();
  const pending = await placeEdits
    .find({ status: "pending" })
    .sort({ createdAt: 1 })
    .limit(limit)
    .toArray();

  if (pending.length === 0) return [];

  const [places, users] = await Promise.all([getPlacesCollection(), getUsersCollection()]);
  const placeIds = [...new Set(pending.map((e) => e.placeId.toHexString()))].map(
    (id) => new ObjectId(id),
  );
  const userIds = [...new Set(pending.map((e) => e.userId.toHexString()))].map(
    (id) => new ObjectId(id),
  );

  const [placeDocs, userDocs] = await Promise.all([
    places.find({ _id: { $in: placeIds } }, { projection: { name: 1, slug: 1 } }).toArray(),
    users.find({ _id: { $in: userIds } }, { projection: { username: 1, displayName: 1 } }).toArray(),
  ]);
  const placesById = new Map(placeDocs.map((p) => [p._id.toHexString(), p]));
  const usersById = new Map(userDocs.map((u) => [u._id.toHexString(), u]));

  return pending
    .filter((edit) => placesById.has(edit.placeId.toHexString())) // skip edits on a since-deleted place
    .map((edit) => {
      const place = placesById.get(edit.placeId.toHexString())!;
      const contributor = usersById.get(edit.userId.toHexString());
      return {
        id: edit._id.toHexString(),
        place: { id: place._id.toHexString(), name: place.name, slug: place.slug },
        changes: edit.changes,
        reason: edit.reason,
        createdAt: edit.createdAt.toISOString(),
        contributor: contributor
          ? { username: contributor.username, displayName: contributor.displayName }
          : null,
      };
    });
}

/**
 * §2.2's 21-50 spam-score band: "published, flagged=true (appears on a
 * moderator watchlist)." There's no separate boolean field for this — the
 * spamScore itself, still on the document for audit, IS the flag. A
 * moderator dismissing an item sets spamReviewedAt so it drops off without
 * touching that historical score.
 */
async function getWatchlist(limit: number): Promise<WatchlistItem[]> {
  const places = await getPlacesCollection();
  const flagged = await places
    .find({
      status: "published",
      spamScore: { $gte: 21, $lte: 50 },
      spamReviewedAt: { $exists: false },
    })
    .sort({ createdAt: 1 })
    .limit(limit)
    .toArray();

  if (flagged.length === 0) return [];

  const categoryIds = [...new Set(flagged.map((p) => p.categoryId.toHexString()))].map(
    (id) => new ObjectId(id),
  );
  const contributorIds = [
    ...new Set(flagged.filter((p) => p.createdBy).map((p) => p.createdBy!.toHexString())),
  ].map((id) => new ObjectId(id));

  const [categories, users] = await Promise.all([getCategoriesCollection(), getUsersCollection()]);
  const [categoryDocs, userDocs] = await Promise.all([
    categories.find({ _id: { $in: categoryIds } }).toArray(),
    users.find({ _id: { $in: contributorIds } }, { projection: { username: 1, displayName: 1 } }).toArray(),
  ]);
  const categoriesById = new Map(categoryDocs.map((c) => [c._id.toHexString(), c]));
  const usersById = new Map(userDocs.map((u) => [u._id.toHexString(), u]));

  return flagged.map((doc) => {
    const category = categoriesById.get(doc.categoryId.toHexString());
    const contributor = doc.createdBy ? usersById.get(doc.createdBy.toHexString()) : undefined;
    return {
      id: doc._id.toHexString(),
      name: doc.name,
      slug: doc.slug,
      category: { name: category?.name ?? "Unknown", icon: category?.icon ?? "help-circle" },
      district: doc.district,
      locality: doc.locality,
      pincode: doc.pincode,
      createdAt: doc.createdAt.toISOString(),
      contributor: contributor
        ? { username: contributor.username, displayName: contributor.displayName }
        : null,
      spamScore: doc.spamScore,
      spamReasons: doc.spamReasons ?? [],
    };
  });
}

async function getOpenReports(limit: number): Promise<ReportQueueItem[]> {
  const reports = await getReportsCollection();
  const open = await reports
    .find({ status: { $in: ["open", "reviewing"] } })
    .sort({ createdAt: 1 })
    .limit(limit)
    .toArray();

  if (open.length === 0) return [];

  const [places, users] = await Promise.all([getPlacesCollection(), getUsersCollection()]);
  const placeIds = [...new Set(open.map((r) => r.placeId.toHexString()))].map(
    (id) => new ObjectId(id),
  );
  const userIds = [...new Set(open.map((r) => r.userId.toHexString()))].map(
    (id) => new ObjectId(id),
  );

  const [placeDocs, userDocs] = await Promise.all([
    places.find({ _id: { $in: placeIds } }, { projection: { name: 1, slug: 1 } }).toArray(),
    users.find({ _id: { $in: userIds } }, { projection: { username: 1, displayName: 1 } }).toArray(),
  ]);
  const placesById = new Map(placeDocs.map((p) => [p._id.toHexString(), p]));
  const usersById = new Map(userDocs.map((u) => [u._id.toHexString(), u]));

  return open
    .filter((report) => placesById.has(report.placeId.toHexString()))
    .map((report) => {
      const place = placesById.get(report.placeId.toHexString())!;
      const contributor = usersById.get(report.userId.toHexString());
      return {
        id: report._id.toHexString(),
        place: { id: place._id.toHexString(), name: place.name, slug: place.slug },
        reason: report.reason,
        details: report.details,
        createdAt: report.createdAt.toISOString(),
        contributor: contributor
          ? { username: contributor.username, displayName: contributor.displayName }
          : null,
      };
    });
}
