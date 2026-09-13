/**
 * Pure duplicate-scoring logic — no DB import, so it's cheap to unit test in
 * isolation (same reasoning as lib/search/parseQuery.ts vs. service.ts).
 * duplicateDetection.ts adds the one DB-touching function on top of this.
 */
import type { PlaceDoc } from "@/types/domain";

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Classic edit-distance DP — small strings (shop names), so O(n*m) is fine. */
export function levenshteinDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(0));

  for (let i = 0; i < rows; i++) dp[i][0] = i;
  for (let j = 0; j < cols; j++) dp[0][j] = j;

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[rows - 1][cols - 1];
}

/** 1 = identical, 0 = completely different. Normalizes both names first. */
export function nameSimilarity(a: string, b: string): number {
  const normA = normalizeName(a);
  const normB = normalizeName(b);
  if (!normA && !normB) return 1;
  if (!normA || !normB) return 0;
  const maxLen = Math.max(normA.length, normB.length);
  return 1 - levenshteinDistance(normA, normB) / maxLen;
}

const EARTH_RADIUS_METERS = 6_371_000;

/** Haversine great-circle distance. lat/lng in degrees. */
export function haversineDistanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}

export const NAME_SIMILARITY_THRESHOLD = 0.6;
export const PROXIMITY_THRESHOLD_METERS = 200;

export interface DuplicateCandidateInput {
  name: string;
  locality: string;
  lat: number;
  lng: number;
  phone?: string;
}

export interface DuplicateMatch {
  id: string;
  name: string;
  slug: string;
  locality: string;
  district: string;
  pincode: string;
  phone?: string;
  nameSimilarity: number;
  distanceMeters: number;
  phoneMatch: boolean;
}

/** True if this candidate is close enough on ANY signal to warrant a warning. */
function isLikelyDuplicate(
  input: DuplicateCandidateInput,
  candidate: PlaceDoc,
): { match: boolean; similarity: number; distanceMeters: number; phoneMatch: boolean } {
  const similarity = nameSimilarity(input.name, candidate.name);
  const distanceMeters = haversineDistanceMeters(
    { lat: input.lat, lng: input.lng },
    { lat: candidate.location.coordinates[1], lng: candidate.location.coordinates[0] },
  );
  const phoneMatch = Boolean(input.phone && candidate.phone && input.phone === candidate.phone);

  const match =
    similarity >= NAME_SIMILARITY_THRESHOLD ||
    distanceMeters <= PROXIMITY_THRESHOLD_METERS ||
    phoneMatch;

  return { match, similarity, distanceMeters, phoneMatch };
}

/**
 * Scores a candidate list in memory (pure, testable) — findPossibleDuplicates
 * in duplicateDetection.ts is just this plus the DB query that produces
 * `candidates`.
 */
export function scoreDuplicateCandidates(
  input: DuplicateCandidateInput,
  candidates: PlaceDoc[],
): DuplicateMatch[] {
  return candidates
    .map((candidate): DuplicateMatch | null => {
      const { match, similarity, distanceMeters, phoneMatch } = isLikelyDuplicate(input, candidate);
      if (!match) return null;
      return {
        id: candidate._id.toHexString(),
        name: candidate.name,
        slug: candidate.slug,
        locality: candidate.locality,
        district: candidate.district,
        pincode: candidate.pincode,
        phone: candidate.phone,
        nameSimilarity: similarity,
        distanceMeters: Math.round(distanceMeters),
        phoneMatch,
      };
    })
    .filter((m): m is DuplicateMatch => m !== null)
    .sort((a, b) => b.nameSimilarity - a.nameSimilarity || a.distanceMeters - b.distanceMeters)
    .slice(0, 3);
}
