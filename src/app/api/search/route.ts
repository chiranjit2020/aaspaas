import { NextResponse, type NextRequest } from "next/server";
import { parseSearchQuery } from "@/lib/validation/search";
import { searchPlaces } from "@/lib/search/service";
import { checkRateLimit } from "@/lib/rateLimit";
import { getClientIp } from "@/lib/http/clientIp";

/**
 * GET /api/search — free-text + filtered search. See roadmap §1.6.
 * §2.1: "Anonymous reads: 60 requests/min/IP."
 */
export async function GET(request: NextRequest) {
  const rate = await checkRateLimit({
    key: `read:${getClientIp(request)}`,
    limit: 60,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json({ error: "Too many requests. Slow down and try again shortly." }, { status: 429 });
  }

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
