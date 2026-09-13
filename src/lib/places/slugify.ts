import type { Collection } from "mongodb";
import type { PlaceDoc } from "@/types/domain";

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/**
 * Appends -2, -3, ... until the slug is free. Places are created one at a
 * time through this route (unlike scripts/seed.ts's bulk insert, which
 * dedupes with an in-memory index instead), so a DB check per candidate is
 * the simplest correct approach.
 */
export async function makeUniquePlaceSlug(
  places: Collection<PlaceDoc>,
  name: string,
): Promise<string> {
  const base = slugify(name) || "place";
  let candidate = base;
  let suffix = 2;
  while (await places.findOne({ slug: candidate }, { projection: { _id: 1 } })) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}
