import { describe, expect, it } from "vitest";
import { parseSearchQuery } from "@/lib/validation/search";
import { MAX_PAGE_SIZE } from "@/lib/search/buildQuery";

function params(obj: Record<string, string>): URLSearchParams {
  return new URLSearchParams(obj);
}

describe("parseSearchQuery — API-level validation", () => {
  it("accepts an empty query (browse mode)", () => {
    const result = parseSearchQuery(params({}));
    expect(result.success).toBe(true);
  });

  it("accepts a well-formed search", () => {
    const result = parseSearchQuery(
      params({ q: "mobile repair habra", category: "mobile-repair", limit: "10" }),
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.q).toBe("mobile repair habra");
      expect(result.data.limit).toBe(10);
    }
  });

  it("rejects a pincode that isn't 6 digits", () => {
    expect(parseSearchQuery(params({ pincode: "123" })).success).toBe(false);
    expect(parseSearchQuery(params({ pincode: "1234567" })).success).toBe(false);
    expect(parseSearchQuery(params({ pincode: "abcdef" })).success).toBe(false);
  });

  it("accepts a valid 6-digit pincode", () => {
    expect(parseSearchQuery(params({ pincode: "743263" })).success).toBe(true);
  });

  it("rejects a query longer than 200 characters", () => {
    const result = parseSearchQuery(params({ q: "a".repeat(201) }));
    expect(result.success).toBe(false);
  });

  it("clamps/rejects limit outside [1, MAX_PAGE_SIZE]", () => {
    expect(parseSearchQuery(params({ limit: "0" })).success).toBe(false);
    expect(parseSearchQuery(params({ limit: String(MAX_PAGE_SIZE + 1) })).success).toBe(false);
    expect(parseSearchQuery(params({ limit: String(MAX_PAGE_SIZE) })).success).toBe(true);
  });

  it("defaults limit when not provided", () => {
    const result = parseSearchQuery(params({}));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.limit).toBeGreaterThan(0);
  });

  it("rejects a non-numeric limit", () => {
    expect(parseSearchQuery(params({ limit: "abc" })).success).toBe(false);
  });
});
