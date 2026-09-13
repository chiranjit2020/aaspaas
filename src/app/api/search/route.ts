import { NextResponse, type NextRequest } from "next/server";
import { parseSearchQuery } from "@/lib/validation/search";
import { searchPlaces } from "@/lib/search/service";

/** GET /api/search — free-text + filtered search. See roadmap §1.6. */
export async function GET(request: NextRequest) {
  const parsed = parseSearchQuery(request.nextUrl.searchParams);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query", issues: parsed.issues }, { status: 400 });
  }

  const { q, district, locality, pincode, category, cursor, limit } = parsed.data;
  const result = await searchPlaces({
    q,
    district,
    locality,
    pincode,
    categorySlug: category,
    cursor,
    limit,
  });
  return NextResponse.json(result);
}
