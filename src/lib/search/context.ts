import { getCategoriesCollection } from "@/lib/db/models/category";
import { getPlacesCollection } from "@/lib/db/models/place";
import type { CategoryDoc } from "@/types/domain";
import type { ParseQueryContext } from "./parseQuery";

/**
 * Everything parseQuery needs (category synonyms, known localities) barely
 * changes minute to minute, so a short in-process cache is enough for V1 — same
 * "no Redis needed yet" philosophy as roadmap §1.6's popular-query cache.
 */

const CACHE_TTL_MS = 5 * 60 * 1000;

interface SearchContext extends ParseQueryContext {
  categoriesBySlug: Map<string, CategoryDoc>;
  categoriesById: Map<string, CategoryDoc>;
}

let cached: { context: SearchContext; expiresAt: number } | null = null;

async function loadSearchContext(): Promise<SearchContext> {
  const [categoriesCol, placesCol] = await Promise.all([
    getCategoriesCollection(),
    getPlacesCollection(),
  ]);

  const [categoryDocs, districts, localities] = await Promise.all([
    categoriesCol.find({}).toArray(),
    placesCol.distinct("district", { status: "published" }),
    placesCol.distinct("locality", { status: "published" }),
  ]);

  const categoriesBySlug = new Map(categoryDocs.map((c) => [c.slug, c]));
  const categoriesById = new Map(categoryDocs.map((c) => [c._id.toHexString(), c]));

  return {
    categories: categoryDocs.map((c) => ({ slug: c.slug, name: c.name, synonyms: c.synonyms })),
    localities: Array.from(new Set([...districts, ...localities])),
    categoriesBySlug,
    categoriesById,
  };
}

export async function getSearchContext(): Promise<SearchContext> {
  if (cached && cached.expiresAt > Date.now()) return cached.context;
  const context = await loadSearchContext();
  cached = { context, expiresAt: Date.now() + CACHE_TTL_MS };
  return context;
}

/** Exposed for tests / admin tooling that just changed categories or places. */
export function invalidateSearchContextCache(): void {
  cached = null;
}
