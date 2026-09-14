/**
 * Ranking + cursor pagination for search results, per
 * 07-roadmap-and-architecture.md §1.6 step 4-5:
 *
 *   rankScore = text relevance + usefulCount signal + a small recency boost
 *
 * Cursor-based (not skip/limit) so pages stay fast as the collection grows: the
 * cursor encodes the last row's (sort field value, _id) tuple and the next page
 * asks Mongo for "rows that sort after this one" instead of "skip N rows".
 *
 * Relevance comes first: a popular place must never bury a more relevant one just
 * because it has more votes. usefulCount/notUsefulCount are log-scaled for exactly
 * that reason — a linear term lets vote count dominate arbitrarily (500 useful
 * votes would add +1000 to a raw `usefulCount*2` term, dwarfing any plausible
 * $text score), while ln(1+n) keeps 10 votes and 500 votes only a few points
 * apart, so text relevance stays the deciding factor among matched documents.
 *
 * Phase 4 (Geo/Maps) added a second sort field, `distanceMeters`, for near-me
 * radius search (see buildQuery.ts's buildGeoSearchPipeline). The cursor codec
 * below is generic over which field a given pipeline sorts by, rather than two
 * independent implementations, since the two modes are mutually exclusive per
 * request and the shape (a sort value + an _id tiebreaker) is identical.
 */
import { ObjectId, type Document } from "mongodb";

export type SortField = "rankScore" | "distanceMeters";

/** rankScore ranks best-first (descending); distanceMeters ranks nearest-first (ascending). */
const SORT_DIRECTION: Record<SortField, "asc" | "desc"> = {
  rankScore: "desc",
  distanceMeters: "asc",
};

export const RANK_SORT: Document = { rankScore: -1, _id: 1 };
export const DISTANCE_SORT: Document = { distanceMeters: 1, _id: 1 };

/**
 * Stages that compute `rankScore` on each candidate document. Must run after the
 * $match stage that (optionally) performs the $text search, since `$meta:
 * "textScore"` is only available on documents that matched a $text query.
 */
export function buildScoringStages(usedTextSearch: boolean): Document[] {
  return [
    {
      $addFields: {
        textScore: usedTextSearch ? { $meta: "textScore" } : 0,
        // Boost decays from 1 (brand new) toward 0 over ~90 days; never negative.
        recencyBoost: {
          $divide: [
            1,
            {
              $add: [
                1,
                {
                  $divide: [
                    { $subtract: ["$$NOW", "$createdAt"] },
                    1000 * 60 * 60 * 24 * 90,
                  ],
                },
              ],
            },
          ],
        },
      },
    },
    {
      $addFields: {
        rankScore: {
          $add: [
            { $multiply: ["$textScore", 10] },
            { $multiply: [{ $ln: [{ $add: [{ $ifNull: ["$usefulCount", 0] }, 1] }] }, 3] },
            { $multiply: [{ $ln: [{ $add: [{ $ifNull: ["$notUsefulCount", 0] }, 1] }] }, -2] },
            "$recencyBoost",
          ],
        },
      },
    },
  ];
}

export interface SearchCursor {
  field: SortField;
  value: number;
  id: string;
}

export function encodeCursor(cursor: SearchCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

export function decodeCursor(raw: string): SearchCursor | null {
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (
      (parsed?.field === "rankScore" || parsed?.field === "distanceMeters") &&
      typeof parsed?.value === "number" &&
      typeof parsed?.id === "string" &&
      ObjectId.isValid(parsed.id)
    ) {
      return { field: parsed.field, value: parsed.value, id: parsed.id };
    }
    return null;
  } catch {
    return null;
  }
}

/** $match stage that keeps only rows sorting strictly after the given cursor. */
export function buildCursorMatchStage(cursor: SearchCursor): Document {
  const op = SORT_DIRECTION[cursor.field] === "asc" ? "$gt" : "$lt";
  return {
    $match: {
      $expr: {
        $or: [
          { [op]: [`$${cursor.field}`, cursor.value] },
          {
            $and: [
              { $eq: [`$${cursor.field}`, cursor.value] },
              { $gt: ["$_id", new ObjectId(cursor.id)] },
            ],
          },
        ],
      },
    },
  };
}
