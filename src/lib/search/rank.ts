/**
 * Ranking + cursor pagination for search results, per
 * 07-roadmap-and-architecture.md §1.6 step 4-5:
 *
 *   rankScore = text relevance + usefulCount signal + a small recency boost
 *
 * Cursor-based (not skip/limit) so pages stay fast as the collection grows: the
 * cursor encodes the last row's (rankScore, _id) tuple and the next page asks Mongo
 * for "rows that sort after this one" instead of "skip N rows".
 */
import { ObjectId, type Document } from "mongodb";

export const RANK_SORT: Document = { rankScore: -1, _id: 1 };

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
            { $multiply: [{ $ifNull: ["$usefulCount", 0] }, 2] },
            { $multiply: [{ $ifNull: ["$notUsefulCount", 0] }, -1] },
            "$recencyBoost",
          ],
        },
      },
    },
  ];
}

export interface SearchCursor {
  rankScore: number;
  id: string;
}

export function encodeCursor(cursor: SearchCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

export function decodeCursor(raw: string): SearchCursor | null {
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (
      typeof parsed?.rankScore === "number" &&
      typeof parsed?.id === "string" &&
      ObjectId.isValid(parsed.id)
    ) {
      return { rankScore: parsed.rankScore, id: parsed.id };
    }
    return null;
  } catch {
    return null;
  }
}

/** $match stage that keeps only rows sorting strictly after the given cursor. */
export function buildCursorMatchStage(cursor: SearchCursor): Document {
  return {
    $match: {
      $expr: {
        $or: [
          { $lt: ["$rankScore", cursor.rankScore] },
          {
            $and: [
              { $eq: ["$rankScore", cursor.rankScore] },
              { $gt: ["$_id", new ObjectId(cursor.id)] },
            ],
          },
        ],
      },
    },
  };
}
