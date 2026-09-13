import { describe, expect, it } from "vitest";
import { slugify } from "@/lib/places/slugify";

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Maa Electronics")).toBe("maa-electronics");
  });

  it("strips punctuation", () => {
    expect(slugify("Maa Electronics (Habra)")).toBe("maa-electronics-habra");
  });

  it("collapses repeated separators", () => {
    expect(slugify("Maa   Electronics!!")).toBe("maa-electronics");
  });

  it("trims leading/trailing hyphens", () => {
    expect(slugify("-Maa Electronics-")).toBe("maa-electronics");
  });
});
