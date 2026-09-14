import { z } from "zod";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, MAX_RADIUS_KM } from "@/lib/search/buildQuery";

/**
 * Query params for GET /api/search and GET /api/places. Shared by both since
 * "browse" is just "search with an empty free-text term" — see roadmap §1.6.
 *
 * zod is the single source of truth for what a "valid request" looks like; the
 * route handler never trusts a raw URLSearchParams value beyond this.
 *
 * Phase 4 (Geo/Maps) added lat/lng/radiusKm for near-me radius search. lat and
 * lng must arrive together — a `.refine` enforces that, since either alone is
 * meaningless to searchPlaces' $geoNear branch. radiusKm has no `.default()`
 * here on purpose: it means nothing without lat/lng, so it's left undefined
 * and defaulted downstream (searchPlaces) only once geo mode is actually active.
 */
export const searchQuerySchema = z
  .object({
    q: z.string().trim().max(200).optional().default(""),
    district: z.string().trim().max(120).optional(),
    locality: z.string().trim().max(120).optional(),
    pincode: z
      .string()
      .trim()
      .regex(/^\d{6}$/, "pincode must be 6 digits")
      .optional(),
    category: z.string().trim().max(120).optional(),
    cursor: z.string().trim().max(500).optional(),
    limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional().default(DEFAULT_PAGE_SIZE),
    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
    radiusKm: z.coerce.number().positive().max(MAX_RADIUS_KM).optional(),
  })
  .refine((data) => (data.lat === undefined) === (data.lng === undefined), {
    message: "lat and lng must be provided together",
    path: ["lat"],
  });

export type SearchQueryInput = z.infer<typeof searchQuerySchema>;

export type SearchQueryParseResult =
  | { success: true; data: SearchQueryInput }
  | { success: false; issues: z.ZodIssue[] };

export function parseSearchQuery(searchParams: URLSearchParams): SearchQueryParseResult {
  const raw = Object.fromEntries(searchParams.entries());
  const result = searchQuerySchema.safeParse(raw);
  if (!result.success) {
    return { success: false, issues: result.error.issues };
  }
  return { success: true, data: result.data };
}
