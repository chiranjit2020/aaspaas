/**
 * Duplicate detection, per 07-roadmap-and-architecture.md §2's threat table:
 * "Synchronous check on submit: name similarity + same locality + <200m
 * proximity + phone match → surfaced to the submitter *before* creation."
 *
 * Deterministic, no ML — matches the same "no ML needed for V1" philosophy
 * as spamScore.ts. The scoring itself is pure (lib/trust/duplicateScoring.ts,
 * no DB import, cheap to unit test); this file is the one DB-touching
 * function that queries candidates in the same locality (a small, bounded
 * set at V1 scale) and hands them to the scorer.
 */
import { getPlacesCollection } from "@/lib/db/models/place";
import { scoreDuplicateCandidates, type DuplicateCandidateInput, type DuplicateMatch } from "./duplicateScoring";

export type { DuplicateCandidateInput, DuplicateMatch };
export {
  normalizeName,
  levenshteinDistance,
  nameSimilarity,
  haversineDistanceMeters,
  scoreDuplicateCandidates,
  NAME_SIMILARITY_THRESHOLD,
  PROXIMITY_THRESHOLD_METERS,
} from "./duplicateScoring";

/**
 * Same locality, not already rejected/removed — a locality-scoped result set
 * is small at V1 scale (tens of places), so scoring in memory beats the
 * complexity of combining $geoNear with other filters in one aggregation.
 *
 * The 500 cap is a defensive ceiling, not an expected size — M6's hardening
 * pass flagged this as the one query in the app that scales with a single
 * locality's lifetime place count rather than a page size. If a locality
 * ever gets that dense, a $geoNear pre-filter is the real fix; capping costs
 * nothing now and bounds the worst case in the meantime.
 */
export async function findPossibleDuplicates(
  input: DuplicateCandidateInput,
): Promise<DuplicateMatch[]> {
  const places = await getPlacesCollection();
  const candidates = await places
    .find({
      locality: input.locality,
      status: { $in: ["published", "pending", "flagged"] },
    })
    .limit(500)
    .toArray();

  return scoreDuplicateCandidates(input, candidates);
}
