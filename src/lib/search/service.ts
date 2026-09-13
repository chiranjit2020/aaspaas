import { ObjectId } from "mongodb";
import type { PlaceDoc, PlaceSummary } from "@/types/domain";
import { getPlacesCollection } from "@/lib/db/models/place";
import { getUsersCollection } from "@/lib/db/models/user";
import { toPlaceSummary, type Contributor } from "@/lib/db/serialize";
import { getSearchContext } from "./context";
import { parseQuery } from "./parseQuery";
import { buildSearchPipeline, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "./buildQuery";
import { encodeCursor } from "./rank";

export interface SearchPlacesParams {
  /** Free-text query, e.g. "mobile repair habra 743263" — parsed for filters. */
  q?: string;
  /** Explicit filters win over anything parsed out of `q`. */
  district?: string;
  locality?: string;
  pincode?: string;
  categorySlug?: string;
  cursor?: string;
  limit?: number;
}

export interface SearchPlacesResult {
  items: PlaceSummary[];
  nextCursor: string | null;
}

type RankedPlaceDoc = PlaceDoc & { rankScore: number };

/**
 * Shared by GET /api/places (plain browse — no `q`) and GET /api/search (free-text
 * + filters). "Browse" really is "search with an empty free-text term" per
 * roadmap §1.6, so both routes fall through to this one implementation.
 */
export async function searchPlaces(params: SearchPlacesParams): Promise<SearchPlacesResult> {
  const context = await getSearchContext();
  const parsed = params.q?.trim()
    ? parseQuery(params.q, context)
    : { freeText: "", pincode: undefined, locality: undefined, categorySlug: undefined };

  const locality = params.locality ?? params.district ?? parsed.locality;
  const pincode = params.pincode ?? parsed.pincode;
  const categorySlug = params.categorySlug ?? parsed.categorySlug;
  const categoryId = categorySlug ? context.categoriesBySlug.get(categorySlug)?._id : undefined;

  const limit = Math.min(Math.max(params.limit ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);

  const { pipeline } = buildSearchPipeline({
    freeText: parsed.freeText,
    locality,
    pincode,
    categoryId: categoryId?.toHexString(),
    cursor: params.cursor,
    limit,
  });

  const places = await getPlacesCollection();
  const docs = (await places.aggregate(pipeline).toArray()) as RankedPlaceDoc[];

  const hasMore = docs.length > limit;
  const pageDocs = hasMore ? docs.slice(0, limit) : docs;

  // One batched query for the whole page's contributors, not one per place —
  // a page is at most MAX_PAGE_SIZE places, so this stays a single round trip
  // no matter how many of them share (or don't share) a creator.
  const contributorIds = Array.from(
    new Set(pageDocs.filter((d) => d.createdBy).map((d) => d.createdBy!.toHexString())),
  );
  const contributorsById = new Map<string, Contributor>();
  if (contributorIds.length > 0) {
    const users = await getUsersCollection();
    const userDocs = await users
      .find(
        { _id: { $in: contributorIds.map((id) => new ObjectId(id)) } },
        { projection: { username: 1, displayName: 1 } },
      )
      .toArray();
    for (const u of userDocs) {
      contributorsById.set(u._id.toHexString(), { username: u.username, displayName: u.displayName });
    }
  }

  const items = pageDocs.map((doc) =>
    toPlaceSummary(
      doc,
      context.categoriesById.get(doc.categoryId.toHexString()),
      doc.createdBy ? (contributorsById.get(doc.createdBy.toHexString()) ?? null) : null,
    ),
  );

  const last = pageDocs[pageDocs.length - 1];
  const nextCursor =
    hasMore && last ? encodeCursor({ rankScore: last.rankScore, id: last._id.toHexString() }) : null;

  return { items, nextCursor };
}
