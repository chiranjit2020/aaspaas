import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import { toPlaceSummary, toPlaceDetail } from "@/lib/db/serialize";
import type { CategoryDoc, PlaceDoc } from "@/types/domain";

const category: CategoryDoc = {
  _id: new ObjectId(),
  slug: "electronics",
  name: "Electronics",
  icon: "cpu",
  synonyms: ["electronics"],
};

function makePlaceDoc(overrides: Partial<PlaceDoc> = {}): PlaceDoc {
  return {
    _id: new ObjectId(),
    name: "Maa Electronics",
    slug: "maa-electronics",
    categoryId: category._id,
    district: "24 Parganas North",
    locality: "Habra",
    pincode: "743263",
    // GeoJSON order is [lng, lat] — deliberately different values so a
    // swapped-order bug would fail these assertions.
    location: { type: "Point", coordinates: [88.6616132, 22.8530023] },
    createdBy: null,
    ownerId: null,
    status: "published",
    spamScore: 0,
    verificationCount: 0,
    usefulCount: 3,
    notUsefulCount: 1,
    tier: "free",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("toPlaceSummary", () => {
  it("converts GeoJSON [lng, lat] coordinates into a named {lat, lng} object", () => {
    const summary = toPlaceSummary(makePlaceDoc(), category, null);
    expect(summary.location).toEqual({ lat: 22.8530023, lng: 88.6616132 });
  });

  it("leaves distanceMeters undefined when the doc has no distanceMeters (a plain, non-geo query)", () => {
    const summary = toPlaceSummary(makePlaceDoc(), category, null);
    expect(summary.distanceMeters).toBeUndefined();
  });

  it("rounds distanceMeters when the doc came from a $geoNear pipeline", () => {
    const doc = { ...makePlaceDoc(), distanceMeters: 1234.6 };
    const summary = toPlaceSummary(doc, category, null);
    expect(summary.distanceMeters).toBe(1235);
  });
});

describe("toPlaceDetail", () => {
  it("inherits location from toPlaceSummary and still builds mapQuery", () => {
    const doc = makePlaceDoc({ address: "Saptapally", description: "Repairs" });
    const detail = toPlaceDetail(doc, category, null);
    expect(detail.location).toEqual({ lat: 22.8530023, lng: 88.6616132 });
    expect(detail.mapQuery).toBe("Maa Electronics, Saptapally, Habra, 24 Parganas North");
  });
});
