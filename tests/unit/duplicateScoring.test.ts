import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import {
  normalizeName,
  levenshteinDistance,
  nameSimilarity,
  haversineDistanceMeters,
  scoreDuplicateCandidates,
  NAME_SIMILARITY_THRESHOLD,
  PROXIMITY_THRESHOLD_METERS,
} from "@/lib/trust/duplicateScoring";
import type { PlaceDoc } from "@/types/domain";

describe("normalizeName", () => {
  it("lowercases and strips punctuation", () => {
    expect(normalizeName("Maa Electronics (Habra)")).toBe("maa electronics habra");
  });

  it("collapses repeated whitespace", () => {
    expect(normalizeName("Maa   Electronics")).toBe("maa electronics");
  });
});

describe("levenshteinDistance", () => {
  it("is 0 for identical strings", () => {
    expect(levenshteinDistance("abc", "abc")).toBe(0);
  });

  it("is the length of the longer string against an empty one", () => {
    expect(levenshteinDistance("abc", "")).toBe(3);
  });

  it("counts a single substitution", () => {
    expect(levenshteinDistance("cat", "cot")).toBe(1);
  });
});

describe("nameSimilarity", () => {
  it("is 1 for identical (post-normalization) names", () => {
    expect(nameSimilarity("Maa Electronics", "MAA ELECTRONICS")).toBe(1);
  });

  it("is high for a minor variation", () => {
    expect(nameSimilarity("Maa Electronics", "Maa Electronic")).toBeGreaterThan(
      NAME_SIMILARITY_THRESHOLD,
    );
  });

  it("is low for unrelated names", () => {
    expect(nameSimilarity("Maa Electronics", "Ganesh Bakery")).toBeLessThan(
      NAME_SIMILARITY_THRESHOLD,
    );
  });
});

describe("haversineDistanceMeters", () => {
  it("is ~0 for the same point", () => {
    const p = { lat: 22.8433, lng: 88.6961 };
    expect(haversineDistanceMeters(p, p)).toBeLessThan(1);
  });

  it("is within the expected ballpark for two nearby points", () => {
    // Roughly 0.001 degrees latitude ≈ 111m
    const a = { lat: 22.8433, lng: 88.6961 };
    const b = { lat: 22.8443, lng: 88.6961 };
    const d = haversineDistanceMeters(a, b);
    expect(d).toBeGreaterThan(90);
    expect(d).toBeLessThan(130);
  });

  it("is large for genuinely distant points", () => {
    const habra = { lat: 22.8433, lng: 88.6961 };
    const delhi = { lat: 28.6139, lng: 77.209 };
    expect(haversineDistanceMeters(habra, delhi)).toBeGreaterThan(1_000_000);
  });
});

function makePlace(overrides: Partial<PlaceDoc>): PlaceDoc {
  return {
    _id: new ObjectId(),
    name: "Maa Electronics",
    slug: "maa-electronics",
    categoryId: new ObjectId(),
    district: "North 24 Parganas",
    locality: "Habra",
    pincode: "743263",
    location: { type: "Point", coordinates: [88.6961, 22.8433] },
    createdBy: null,
    ownerId: null,
    status: "published",
    spamScore: 0,
    verificationCount: 0,
    usefulCount: 0,
    notUsefulCount: 0,
    duplicateOfPlaceId: null,
    tier: "free",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("scoreDuplicateCandidates", () => {
  const input = { name: "Maa Electronics", locality: "Habra", lat: 22.8433, lng: 88.6961 };

  it("matches a near-identical name at the same spot", () => {
    const results = scoreDuplicateCandidates(input, [makePlace({ name: "Maa Electronic" })]);
    expect(results).toHaveLength(1);
    expect(results[0].nameSimilarity).toBeGreaterThan(NAME_SIMILARITY_THRESHOLD);
  });

  it("matches on proximity alone, even with a different name", () => {
    const results = scoreDuplicateCandidates(input, [
      makePlace({ name: "Completely Different Shop" }),
    ]);
    expect(results).toHaveLength(1);
    expect(results[0].distanceMeters).toBeLessThanOrEqual(PROXIMITY_THRESHOLD_METERS);
  });

  it("matches on phone number alone, even far away with a different name", () => {
    const results = scoreDuplicateCandidates(
      { ...input, lat: 12.9, lng: 77.6, phone: "9876543210" }, // Bangalore-ish, not Habra
      [makePlace({ name: "Totally Unrelated", phone: "9876543210" })],
    );
    expect(results).toHaveLength(1);
    expect(results[0].phoneMatch).toBe(true);
  });

  it("does not match an unrelated, distant place", () => {
    const results = scoreDuplicateCandidates(input, [
      makePlace({
        name: "Totally Unrelated Bakery",
        location: { type: "Point", coordinates: [88.9, 23.0] },
      }),
    ]);
    expect(results).toHaveLength(0);
  });

  it("returns at most 3 matches, best first", () => {
    const candidates = Array.from({ length: 5 }, (_, i) =>
      makePlace({ name: `Maa Electronic${"s".repeat(i)}` }),
    );
    const results = scoreDuplicateCandidates(input, candidates);
    expect(results.length).toBeLessThanOrEqual(3);
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].nameSimilarity).toBeGreaterThanOrEqual(results[i].nameSimilarity);
    }
  });
});
