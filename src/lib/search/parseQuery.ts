/**
 * Tokenizes a raw search string into structured filters, per
 * 07-roadmap-and-architecture.md §1.6.
 *
 * Deliberately pure and DB-free so it's cheap to unit test: callers pass in the
 * category synonym table and the list of known localities/districts (both cheap,
 * cacheable reads) rather than this module reaching into Mongo itself.
 */

export interface CategorySynonymEntry {
  slug: string;
  name: string;
  synonyms: string[];
}

export interface ParseQueryContext {
  categories: CategorySynonymEntry[];
  /** Distinct locality/district strings already present in the places collection. */
  localities: string[];
}

export interface ParsedQuery {
  pincode?: string;
  locality?: string;
  categorySlug?: string;
  /** Whatever tokens weren't consumed as a pincode/locality/category match. */
  freeText: string;
}

const PINCODE_RE = /^\d{6}$/;

function normalize(token: string): string {
  return token.trim().toLowerCase();
}

export function parseQuery(raw: string, context: ParseQueryContext): ParsedQuery {
  const tokens = raw
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);

  const localityLookup = new Map(context.localities.map((l) => [normalize(l), l]));
  const categoryLookup = new Map<string, string>();
  for (const category of context.categories) {
    for (const synonym of [category.name, category.slug, ...category.synonyms]) {
      categoryLookup.set(normalize(synonym), category.slug);
    }
  }

  let pincode: string | undefined;
  let locality: string | undefined;
  let categorySlug: string | undefined;
  const leftover: string[] = [];

  // Multi-word category/locality names ("mobile repair", "north 24 parganas") need
  // to be matched before falling back to single tokens, so try the longest phrases
  // first: whole string, then progressively shorter windows.
  const consumed = new Array(tokens.length).fill(false);

  for (let windowSize = tokens.length; windowSize >= 1; windowSize--) {
    for (let start = 0; start + windowSize <= tokens.length; start++) {
      if (consumed.slice(start, start + windowSize).some(Boolean)) continue;
      const phrase = normalize(tokens.slice(start, start + windowSize).join(" "));
      if (!phrase) continue;

      if (!categorySlug && categoryLookup.has(phrase)) {
        categorySlug = categoryLookup.get(phrase);
        for (let i = start; i < start + windowSize; i++) consumed[i] = true;
        continue;
      }
      if (!locality && localityLookup.has(phrase)) {
        locality = localityLookup.get(phrase);
        for (let i = start; i < start + windowSize; i++) consumed[i] = true;
      }
    }
  }

  for (let i = 0; i < tokens.length; i++) {
    if (consumed[i]) continue;
    const token = tokens[i];
    if (!pincode && PINCODE_RE.test(token)) {
      pincode = token;
      consumed[i] = true;
      continue;
    }
    leftover.push(token);
  }

  return {
    pincode,
    locality,
    categorySlug,
    freeText: leftover.join(" ").trim(),
  };
}
