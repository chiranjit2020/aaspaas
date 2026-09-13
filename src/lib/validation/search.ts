import { z } from "zod";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "@/lib/search/buildQuery";

/**
 * Query params for GET /api/search and GET /api/places. Shared by both since
 * "browse" is just "search with an empty free-text term" — see roadmap §1.6.
 *
 * zod is the single source of truth for what a "valid request" looks like; the
 * route handler never trusts a raw URLSearchParams value beyond this.
 */
export const searchQuerySchema = z.object({
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
