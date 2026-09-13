import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import { buildSearchPipeline, MAX_PAGE_SIZE } from "@/lib/search/buildQuery";
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

  it("adds a cursor $match stage only when a valid cursor is given", () => {
    const cursor = encodeCursor({ rankScore: 1.5, id: new ObjectId().toHexString() });
    const withCursor = buildSearchPipeline({ cursor });
    const withoutCursor = buildSearchPipeline({});
    expect(withCursor.pipeline.length).toBe(withoutCursor.pipeline.length + 1);
  });

  it("silently ignores a malformed cursor", () => {
    const { pipeline } = buildSearchPipeline({ cursor: "not-a-real-cursor" });
    const { pipeline: basePipeline } = buildSearchPipeline({});
    expect(pipeline.length).toBe(basePipeline.length);
  });

  it("ends with $sort then $limit", () => {
    const { pipeline } = buildSearchPipeline({});
    expect(pipeline[pipeline.length - 2]).toHaveProperty("$sort");
    expect(pipeline[pipeline.length - 1]).toHaveProperty("$limit");
  });
});
