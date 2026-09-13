import { ObjectId } from "mongodb";
import { getPlacesCollection } from "@/lib/db/models/place";
import { getPlaceEditsCollection } from "@/lib/db/models/placeEdit";
import { getUsersCollection } from "@/lib/db/models/user";
import type { PlaceEditDoc } from "@/types/domain";

export interface PlaceEditSummary {
  id: string;
  changes: PlaceEditDoc["changes"];
  reason?: string;
  status: PlaceEditDoc["status"];
  createdAt: string;
  contributor: { username: string; displayName: string } | null;
}

/**
 * Shared by GET /api/places/[id]/edits and (later, if needed) any page that
 * wants to show a place's correction history. Shows every edit regardless of
 * status (pending/approved/rejected) — per the transparency principle
 * elsewhere in the app (real contributor attribution, no hidden mechanics),
 * knowing a correction was *proposed* and what happened to it is itself
 * useful trust signal, not something to hide until approved.
 */
export async function getPlaceEditHistory(placeId: string): Promise<PlaceEditSummary[] | null> {
  const places = await getPlacesCollection();
  const place = ObjectId.isValid(placeId)
    ? await places.findOne({ _id: new ObjectId(placeId) }, { projection: { _id: 1 } })
    : await places.findOne({ slug: placeId }, { projection: { _id: 1 } });
  if (!place) return null;

  const placeEdits = await getPlaceEditsCollection();
  const edits = await placeEdits.find({ placeId: place._id }).sort({ createdAt: -1 }).toArray();
  if (edits.length === 0) return [];

  const userIds = [...new Set(edits.map((e) => e.userId.toHexString()))].map((id) => new ObjectId(id));
  const users = await getUsersCollection();
  const userDocs = await users.find(
    { _id: { $in: userIds } },
    { projection: { username: 1, displayName: 1 } },
  ).toArray();
  const usersById = new Map(userDocs.map((u) => [u._id.toHexString(), u]));

  return edits.map((edit) => {
    const contributor = usersById.get(edit.userId.toHexString());
    return {
      id: edit._id.toHexString(),
      changes: edit.changes,
      reason: edit.reason,
      status: edit.status,
      createdAt: edit.createdAt.toISOString(),
      contributor: contributor
        ? { username: contributor.username, displayName: contributor.displayName }
        : null,
    };
  });
}
