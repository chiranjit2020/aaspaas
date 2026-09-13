import { describe, expect, it } from "vitest";
import { parseQuery, type ParseQueryContext } from "@/lib/search/parseQuery";

const context: ParseQueryContext = {
  categories: [
    { slug: "plumber", name: "Plumber", synonyms: ["plumber", "plumbing", "fix my tap"] },
    { slug: "mobile-repair", name: "Mobile Repair", synonyms: ["mobile repair", "phone repair"] },
  ],
  localities: ["Habra", "Ashoknagar", "North 24 Parganas"],
};

describe("parseQuery", () => {
  it("extracts a 6-digit pincode", () => {
    expect(parseQuery("743263", context).pincode).toBe("743263");
  });

  it("does not treat a non-6-digit number as a pincode", () => {
    expect(parseQuery("12345", context).pincode).toBeUndefined();
    expect(parseQuery("1234567", context).pincode).toBeUndefined();
  });

  it("matches a category by synonym phrase, not just its slug", () => {
    expect(parseQuery("fix my tap", context).categorySlug).toBe("plumber");
  });

  it("matches a multi-word locality", () => {
    expect(parseQuery("shops in North 24 Parganas", context).locality).toBe(
      "North 24 Parganas",
    );
  });

  it("is case-insensitive", () => {
    expect(parseQuery("HABRA", context).locality).toBe("Habra");
    expect(parseQuery("PLUMBER", context).categorySlug).toBe("plumber");
  });

  it("combines pincode + category + locality + leftover free text", () => {
    const result = parseQuery("mobile repair habra 743263 urgent", context);
    expect(result.categorySlug).toBe("mobile-repair");
    expect(result.locality).toBe("Habra");
    expect(result.pincode).toBe("743263");
    expect(result.freeText).toBe("urgent");
  });

  it("leaves everything as free text when nothing matches", () => {
    const result = parseQuery("random shop name", context);
    expect(result.pincode).toBeUndefined();
    expect(result.locality).toBeUndefined();
    expect(result.categorySlug).toBeUndefined();
    expect(result.freeText).toBe("random shop name");
  });

  it("handles empty input", () => {
    const result = parseQuery("", context);
    expect(result.freeText).toBe("");
    expect(result.pincode).toBeUndefined();
  });

  it("does not double-consume tokens already used by a category match", () => {
    // "repair" alone isn't a synonym, but "mobile repair" is — the leftover
    // shouldn't also contain "mobile" or "repair" once consumed.
    const result = parseQuery("mobile repair near me", context);
    expect(result.categorySlug).toBe("mobile-repair");
    expect(result.freeText).toBe("near me");
  });
});
