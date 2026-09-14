import { describe, expect, it } from "vitest";
import { formatDistance } from "@/lib/places/formatDistance";

describe("formatDistance", () => {
  it("formats sub-kilometer distances in meters", () => {
    expect(formatDistance(42)).toBe("42 m away");
    expect(formatDistance(999)).toBe("999 m away");
  });

  it("rounds meters to the nearest whole number", () => {
    expect(formatDistance(42.6)).toBe("43 m away");
  });

  it("switches to kilometers at the 1000m boundary", () => {
    expect(formatDistance(1000)).toBe("1.0 km away");
  });

  it("formats kilometer distances to one decimal place", () => {
    expect(formatDistance(5432)).toBe("5.4 km away");
  });
});
