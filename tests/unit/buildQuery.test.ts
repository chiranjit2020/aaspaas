import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import { buildSearchPipeline, buildGeoSearchPipeline, MAX_PAGE_SIZE } from "@/lib/search/buildQuery";
import { encodeCursor } from "@/lib/search/rank";

describe("buildSearchPipeline", () => {
  it("always scopes to published places", () => {
    const { pipeline } = buildSearchPipeline({});
    const match = pipeline[0].$match;
    expect(match.status).toBe("published");
  });

  it("uses a prefix regex for short free text instead of $text", () => {
    const { pipeline, usedTextSearch } = buildSearchPipeline({ freeText: "ma" });
    expect(usedTextSearch).toBe(false);
    const match = pipeline[0].$match;
    expect(match.name).toEqual({ $regex: "^ma", $options: "i" });
    expect(match.$text).toBeUndefined();
  });

  it("uses $text for free text of 3+ characters", () => {
    const { pipeline, usedTextSearch } = buildSearchPipeline({ freeText: "electronics" });
    expect(usedTextSearch).toBe(true);
    const match = pipeline[0].$match;
    expect(match.$text).toEqual({ $search: "electronics" });
  });

  it("escapes regex metacharacters in short free text", () => {
    const { pipeline } = buildSearchPipeline({ freeText: "a." });
    const match = pipeline[0].$match;
    expect(match.name.$regex).toBe("^a\\.");
  });

  it("filters by locality or district via $or", () => {
    const { pipeline } = buildSearchPipeline({ locality: "Habra" });
    const match = pipeline[0].$match;
    expect(match.$or).toEqual([{ district: "Habra" }, { locality: "Habra" }]);
  });

  it("filters by exact pincode", () => {
    const { pipeline } = buildSearchPipeline({ pincode: "743263" });
    expect(pipeline[0].$match.pincode).toBe("743263");
  });

  it("converts a valid categoryId string to an ObjectId", () => {
    const id = new ObjectId().toHexString();
    const { pipeline } = buildSearchPipeline({ categoryId: id });
    expect(pipeline[0].$match.categoryId).toBeInstanceOf(ObjectId);
    expect(pipeline[0].$match.categoryId.toHexString()).toBe(id);
  });

  it("ignores an invalid categoryId rather than crashing", () => {
    const { pipeline } = buildSearchPipeline({ categoryId: "not-an-id" });
    expect(pipeline[0].$match.categoryId).toBeUndefined();
  });

  it("clamps limit to MAX_PAGE_SIZE and requests one extra row for pagination", () => {
    const { pipeline } = buildSearchPipeline({ limit: 9999 });
    const limitStage = pipeline.find((stage) => "$limit" in stage);
    expect(limitStage?.$limit).toBe(MAX_PAGE_SIZE + 1);
  });

  it("clamps limit to at least 1", () => {
    const { pipeline } = buildSearchPipeline({ limit: -5 });
    const limitStage = pipeline.find((stage) => "$limit" in stage);
    expect(limitStage?.$limit).toBe(2);
  });

  it("adds a cursor $match stage only when a valid rankScore cursor is given", () => {
    const cursor = encodeCursor({ field: "rankScore", value: 1.5, id: new ObjectId().toHexString() });
    const withCursor = buildSearchPipeline({ cursor });
    const withoutCursor = buildSearchPipeline({});
    expect(withCursor.pipeline.length).toBe(withoutCursor.pipeline.length + 1);
  });

  it("silently ignores a malformed cursor", () => {
    const { pipeline } = buildSearchPipeline({ cursor: "not-a-real-cursor" });
    const { pipeline: basePipeline } = buildSearchPipeline({});
    expect(pipeline.length).toBe(basePipeline.length);
  });

  it("ignores a cursor built for the other pipeline's sort field", () => {
    const cursor = encodeCursor({ field: "distanceMeters", value: 500, id: new ObjectId().toHexString() });
    const { pipeline } = buildSearchPipeline({ cursor });
    const { pipeline: basePipeline } = buildSearchPipeline({});
    expect(pipeline.length).toBe(basePipeline.length);
  });

  it("ends with $sort then $limit", () => {
    const { pipeline } = buildSearchPipeline({});
    expect(pipeline[pipeline.length - 2]).toHaveProperty("$sort");
    expect(pipeline[pipeline.length - 1]).toHaveProperty("$limit");
  });
});

describe("buildGeoSearchPipeline", () => {
  it("puts $geoNear first, with GeoJSON [lng, lat] order", () => {
    const { pipeline } = buildGeoSearchPipeline({ lat: 22.85, lng: 88.66, radiusMeters: 5000 });
    const geoNear = pipeline[0].$geoNear;
    expect(geoNear).toBeDefined();
    expect(geoNear.near).toEqual({ type: "Point", coordinates: [88.66, 22.85] });
    expect(geoNear.distanceField).toBe("distanceMeters");
    expect(geoNear.spherical).toBe(true);
    expect(geoNear.maxDistance).toBe(5000);
  });

  it("always scopes the query filter to published places", () => {
    const { pipeline } = buildGeoSearchPipeline({ lat: 0, lng: 0, radiusMeters: 1000 });
    expect(pipeline[0].$geoNear.query.status).toBe("published");
  });

  it("never uses $text, even for free text of 3+ characters — $geoNear forbids it", () => {
    const { pipeline } = buildGeoSearchPipeline({
      lat: 0,
      lng: 0,
      radiusMeters: 1000,
      freeText: "electronics repair",
    });
    const query = pipeline[0].$geoNear.query;
    expect(query.$text).toBeUndefined();
    expect(query.name).toEqual({ $regex: "^electronics repair", $options: "i" });
  });

  it("filters by locality/district, pincode, and categoryId inside the $geoNear query", () => {
    const categoryId = new ObjectId().toHexString();
    const { pipeline } = buildGeoSearchPipeline({
      lat: 0,
      lng: 0,
      radiusMeters: 1000,
      locality: "Habra",
      pincode: "743263",
      categoryId,
    });
    const query = pipeline[0].$geoNear.query;
    expect(query.$or).toEqual([{ district: "Habra" }, { locality: "Habra" }]);
    expect(query.pincode).toBe("743263");
    expect(query.categoryId).toBeInstanceOf(ObjectId);
  });

  it("adds a cursor $match stage only for a matching distanceMeters cursor", () => {
    const distanceCursor = encodeCursor({ field: "distanceMeters", value: 500, id: new ObjectId().toHexString() });
    const rankCursor = encodeCursor({ field: "rankScore", value: 1, id: new ObjectId().toHexString() });
    const base = buildGeoSearchPipeline({ lat: 0, lng: 0, radiusMeters: 1000 });
    const withMatchingCursor = buildGeoSearchPipeline({ lat: 0, lng: 0, radiusMeters: 1000, cursor: distanceCursor });
    const withMismatchedCursor = buildGeoSearchPipeline({ lat: 0, lng: 0, radiusMeters: 1000, cursor: rankCursor });
    expect(withMatchingCursor.pipeline.length).toBe(base.pipeline.length + 1);
    expect(withMismatchedCursor.pipeline.length).toBe(base.pipeline.length);
  });

  it("ends with a distance $sort then $limit", () => {
    const { pipeline } = buildGeoSearchPipeline({ lat: 0, lng: 0, radiusMeters: 1000 });
    expect(pipeline[pipeline.length - 2]).toEqual({ $sort: { distanceMeters: 1, _id: 1 } });
    expect(pipeline[pipeline.length - 1]).toHaveProperty("$limit");
  });
});
