import { NextResponse, type NextRequest } from "next/server";
import { ObjectId } from "mongodb";
import { getPlaceById } from "@/lib/places/getPlaceById";
import { getCurrentUser } from "@/lib/auth/session";
import { getPlacesCollection } from "@/lib/db/models/place";
import { getPlaceEditsCollection } from "@/lib/db/models/placeEdit";
import { placeEditInputSchema, type EditablePlaceField } from "@/lib/validation/placeEdit";
import { diffPlaceEdit } from "@/lib/places/diffPlaceEdit";

/** GET /api/places/[id] — accepts either the Mongo _id or the place's slug. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const place = await getPlaceById(id);

  if (!place) {
    return NextResponse.json({ error: "Place not found" }, { status: 404 });
  }

  return NextResponse.json(place);
}

/**
 * PATCH /api/places/[id] — propose an edit ("suggest a correction"). Lands
 * as a pending place_edits document; nothing on the place itself changes
 * until a moderator approves it (POST /api/moderation/edits/[id]).
 *
 * Only accepts the place's own _id, not its slug — the client already has
 * the resolved id from GET /api/places/[id]'s response by the time it's
 * proposing an edit.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getCurrentUser(request);
  if (!session) {
    return NextResponse.json({ error: "You must be logged in to suggest an edit." }, { status: 401 });
  }

  const { id } = await params;
  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid place id" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = placeEditInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { reason, ...proposed } = parsed.data;

  const places = await getPlacesCollection();
  const place = await places.findOne({ _id: new ObjectId(id), status: "published" });
  if (!place) {
    return NextResponse.json({ error: "Place not found" }, { status: 404 });
  }

  const changes = diffPlaceEdit(place, proposed as Partial<Record<EditablePlaceField, string>>);
  if (Object.keys(changes).length === 0) {
    return NextResponse.json(
      { error: "That matches what's already published — nothing to change." },
      { status: 400 },
    );
  }

  const placeEdits = await getPlaceEditsCollection();
  const now = new Date();
  const editDoc = {
    _id: new ObjectId(),
    placeId: place._id,
    userId: new ObjectId(session.sub),
    changes,
    reason,
    status: "pending" as const,
    createdAt: now,
  };
  await placeEdits.insertOne(editDoc);

  return NextResponse.json({ id: editDoc._id.toHexString(), status: editDoc.status }, { status: 201 });
}
