import { NextResponse, type NextRequest } from "next/server";
import { ObjectId } from "mongodb";
import { parseSearchQuery } from "@/lib/validation/search";
import { searchPlaces } from "@/lib/search/service";
import { getCurrentUser } from "@/lib/auth/session";
import { placeInputSchema } from "@/lib/validation/place";
import { getPlacesCollection } from "@/lib/db/models/place";
import { getCategoriesCollection } from "@/lib/db/models/category";
import { getUsersCollection } from "@/lib/db/models/user";
import { makeUniquePlaceSlug } from "@/lib/places/slugify";
import type { PlaceDoc } from "@/types/domain";

/** GET /api/places — browse/list, i.e. search with no free-text term. */
export async function GET(request: NextRequest) {
  const parsed = parseSearchQuery(request.nextUrl.searchParams);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query", issues: parsed.issues }, { status: 400 });
  }

  const { district, locality, pincode, category, cursor, limit } = parsed.data;
  const result = await searchPlaces({ district, locality, pincode, categorySlug: category, cursor, limit });
  return NextResponse.json(result);
}

/**
 * POST /api/places — submit a new place. Requires a session (any logged-in
 * contributor — "verified user" in the roadmap's API table means
 * "authenticated", not "email-verified"; the tiered submission limits in
 * §2.1 explicitly allow unverified accounts a (lower) daily quota).
 *
 * Always lands `pending`: spam-score auto-routing and the daily submission
 * quotas are M5 work, not this milestone. A pending place is already
 * invisible in public search/browse, since searchPlaces always filters to
 * status: "published".
 */
export async function POST(request: NextRequest) {
  const session = await getCurrentUser(request);
  if (!session) {
    return NextResponse.json({ error: "You must be logged in to add a place." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = placeInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const input = parsed.data;

  const categories = await getCategoriesCollection();
  const category = await categories.findOne({ slug: input.categorySlug });
  if (!category) {
    return NextResponse.json({ error: "Unknown category." }, { status: 400 });
  }

  const places = await getPlacesCollection();
  const slug = await makeUniquePlaceSlug(places, input.name);
  const now = new Date();
  const createdBy = new ObjectId(session.sub);

  const doc: PlaceDoc = {
    _id: new ObjectId(),
    name: input.name,
    slug,
    categoryId: category._id,
    description: input.description,
    phone: input.phone,
    district: input.district,
    locality: input.locality,
    pincode: input.pincode,
    location: { type: "Point", coordinates: [input.lng, input.lat] },
    address: input.address,
    createdBy,
    ownerId: null,
    status: "pending",
    spamScore: 0,
    verificationCount: 0,
    usefulCount: 0,
    notUsefulCount: 0,
    duplicateOfPlaceId: null,
    tier: "free",
    createdAt: now,
    updatedAt: now,
  };

  await places.insertOne(doc);

  const users = await getUsersCollection();
  await users.updateOne({ _id: createdBy }, { $inc: { "stats.placesAdded": 1 } });

  return NextResponse.json({ id: doc._id.toHexString(), slug: doc.slug, status: doc.status }, { status: 201 });
}
