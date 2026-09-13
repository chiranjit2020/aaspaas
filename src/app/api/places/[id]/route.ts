import { NextResponse } from "next/server";
import { getPlaceById } from "@/lib/places/getPlaceById";

/** GET /api/places/[id] — accepts either the Mongo _id or the place's slug. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const place = await getPlaceById(id);

  if (!place) {
    return NextResponse.json({ error: "Place not found" }, { status: 404 });
  }

  return NextResponse.json(place);
}
