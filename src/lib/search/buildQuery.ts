/**
 * Composes the Mongo aggregation pipeline for a search request, per
 * 07-roadmap-and-architecture.md §1.6 steps 2-3.
 *
 * Pure and DB-free: takes already-resolved filter values (a category slug has
 * already become a categoryId, a locality token has already been confirmed against
 * known localities by parseQuery) and returns a pipeline for the `places`
 * collection. No network calls happen in here, which is what keeps it unit
 * testable.
 *
 * Phase 4 (Geo/Maps) added buildGeoSearchPipeline alongside the original
 * buildSearchPipeline: a near-me radius search needs $geoNear as its very
 * first stage, and MongoDB forbids combining $geoNear with $text in the same
 * pipeline — two structurally different pipelines, not one pipeline with a
 * conditional stage, is the honest shape for that constraint. service.ts
 * picks one or the other per request; they're mutually exclusive.
 */
import { ObjectId, type Document } from "mongodb";
import {
  buildScoringStages,
  buildCursorMatchStage,
  decodeCursor,
  RANK_SORT,
  DISTANCE_SORT,
} from "./rank";

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;

/** A hyperlocal directory's "near me" is errand-radius, not whole-district —
 * 25km caps it well short of turning cursor pagination into a district dump,
 * the same reasoning behind MAX_PAGE_SIZE. */
export const DEFAULT_RADIUS_KM = 5;
export const MAX_RADIUS_KM = 25;

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
  if (decodedCursor && decodedCursor.field === "rankScore") {
    pipeline.push(buildCursorMatchStage(decodedCursor));
  }

  pipeline.push({ $sort: RANK_SORT }, { $limit: limit + 1 });

  return { pipeline, usedTextSearch };
}

export interface BuildGeoSearchPipelineParams {
  lat: number;
  lng: number;
  radiusMeters: number;
  freeText?: string;
  locality?: string;
  pincode?: string;
  categoryId?: string;
  cursor?: string;
  limit?: number;
}

/**
 * Near-me radius search. $geoNear must be the pipeline's first stage and its
 * `query` option is a plain match filter — no $text allowed inside it — so
 * unlike buildSearchPipeline, free text here is *always* a prefix regex,
 * regardless of length, never $text/textScore. Results come back sorted by
 * distance; the trailing explicit $sort keeps the (distanceMeters, _id)
 * tiebreak stable for cursor pagination, same structure as the rank pipeline.
 */
export function buildGeoSearchPipeline(params: BuildGeoSearchPipelineParams): {
  pipeline: Document[];
} {
  const limit = Math.min(Math.max(params.limit ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  const freeText = params.freeText?.trim();

  const query: Document = { status: "published" };
  if (params.locality) {
    query.$or = [{ district: params.locality }, { locality: params.locality }];
  }
  if (params.pincode) {
    query.pincode = params.pincode;
  }
  if (params.categoryId && ObjectId.isValid(params.categoryId)) {
    query.categoryId = new ObjectId(params.categoryId);
  }
  if (freeText) {
    query.name = { $regex: `^${escapeRegex(freeText)}`, $options: "i" };
  }

  const pipeline: Document[] = [
    {
      $geoNear: {
        near: { type: "Point", coordinates: [params.lng, params.lat] },
        distanceField: "distanceMeters",
        spherical: true,
        maxDistance: params.radiusMeters,
        query,
      },
    },
  ];

  const decodedCursor = params.cursor ? decodeCursor(params.cursor) : null;
  if (decodedCursor && decodedCursor.field === "distanceMeters") {
    pipeline.push(buildCursorMatchStage(decodedCursor));
  }

  pipeline.push({ $sort: DISTANCE_SORT }, { $limit: limit + 1 });

  return { pipeline };
}
