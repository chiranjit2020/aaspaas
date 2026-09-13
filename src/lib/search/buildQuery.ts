/**
 * Composes the Mongo aggregation pipeline for a search request, per
 * 07-roadmap-and-architecture.md §1.6 steps 2-3.
 *
 * Pure and DB-free: takes already-resolved filter values (a category slug has
 * already become a categoryId, a locality token has already been confirmed against
 * known localities by parseQuery) and returns a pipeline for the `places`
 * collection. No network calls happen in here, which is what keeps it unit
 * testable.
 */
import { ObjectId, type Document } from "mongodb";
import { buildScoringStages, RANK_SORT, buildCursorMatchStage, decodeCursor } from "./rank";

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;

export interface BuildSearchPipelineParams {
  freeText?: string;
  locality?: string;
  pincode?: string;
  categoryId?: string;
  cursor?: string;
  limit?: number;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** $text can't do prefix matching, so very short queries fall back to a regex. */
const MIN_LENGTH_FOR_TEXT_SEARCH = 3;

export function buildSearchPipeline(params: BuildSearchPipelineParams): {
  pipeline: Document[];
  usedTextSearch: boolean;
} {
  const limit = Math.min(Math.max(params.limit ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  const freeText = params.freeText?.trim();

  const baseMatch: Document = { status: "published" };
  if (params.locality) {
    baseMatch.$or = [{ district: params.locality }, { locality: params.locality }];
  }
  if (params.pincode) {
    baseMatch.pincode = params.pincode;
  }
  if (params.categoryId && ObjectId.isValid(params.categoryId)) {
    baseMatch.categoryId = new ObjectId(params.categoryId);
  }

  let usedTextSearch = false;
  if (freeText) {
    if (freeText.length < MIN_LENGTH_FOR_TEXT_SEARCH) {
      baseMatch.name = { $regex: `^${escapeRegex(freeText)}`, $options: "i" };
    } else {
      baseMatch.$text = { $search: freeText };
      usedTextSearch = true;
    }
  }

  const pipeline: Document[] = [{ $match: baseMatch }, ...buildScoringStages(usedTextSearch)];

  const decodedCursor = params.cursor ? decodeCursor(params.cursor) : null;
  if (decodedCursor) {
    pipeline.push(buildCursorMatchStage(decodedCursor));
  }

  pipeline.push({ $sort: RANK_SORT }, { $limit: limit + 1 });

  return { pipeline, usedTextSearch };
}
