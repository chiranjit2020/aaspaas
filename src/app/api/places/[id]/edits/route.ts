import { NextResponse } from "next/server";
import { getPlaceEditHistory } from "@/lib/places/getPlaceEditHistory";

/** GET /api/places/[id]/edits — public edit history for a place. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const edits = await getPlaceEditHistory(id);

  if (edits === null) {
    return NextResponse.json({ error: "Place not found" }, { status: 404 });
  }

  return NextResponse.json({ items: edits });
}
