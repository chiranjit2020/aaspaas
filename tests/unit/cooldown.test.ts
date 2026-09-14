import { describe, expect, it } from "vitest";
import { cooldownRemainingMs, isCooldownActive } from "@/lib/trust/cooldown";

const NOW = new Date("2026-01-01T00:00:00Z");

describe("isCooldownActive", () => {
  it("is false when there's no cooldown set", () => {
    expect(isCooldownActive(undefined, NOW)).toBe(false);
    expect(isCooldownActive(null, NOW)).toBe(false);
  });

  it("is true while the cooldown is still in the future", () => {
    expect(isCooldownActive(new Date("2026-01-02T00:00:00Z"), NOW)).toBe(true);
  });

  it("is false once the cooldown has passed", () => {
    expect(isCooldownActive(new Date("2025-12-31T00:00:00Z"), NOW)).toBe(false);
  });

  it("is false exactly at the boundary (until === now)", () => {
    expect(isCooldownActive(NOW, NOW)).toBe(false);
  });
});

describe("cooldownRemainingMs", () => {
  it("returns the remaining time in ms", () => {
    expect(cooldownRemainingMs(new Date("2026-01-01T01:00:00Z"), NOW)).toBe(60 * 60 * 1000);
  });

  it("never returns negative", () => {
    expect(cooldownRemainingMs(new Date("2025-12-31T00:00:00Z"), NOW)).toBe(0);
  });
});
