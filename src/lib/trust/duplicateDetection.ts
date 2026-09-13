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
    .toArray();

  return scoreDuplicateCandidates(input, candidates);
}
