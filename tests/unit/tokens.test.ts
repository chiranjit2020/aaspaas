import { describe, expect, it } from "vitest";
import { generateOpaqueToken, hashOpaqueToken } from "@/lib/auth/tokens";

describe("generateOpaqueToken", () => {
  it("produces a URL-safe, sufficiently long token", () => {
    const token = generateOpaqueToken();
    expect(token.length).toBeGreaterThanOrEqual(40); // 32 bytes, base64url
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("never repeats", () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generateOpaqueToken()));
    expect(tokens.size).toBe(100);
  });
});

describe("hashOpaqueToken", () => {
  it("is deterministic", () => {
    const token = generateOpaqueToken();
    expect(hashOpaqueToken(token)).toBe(hashOpaqueToken(token));
  });

  it("produces different hashes for different tokens", () => {
    expect(hashOpaqueToken("a")).not.toBe(hashOpaqueToken("b"));
  });

  it("does not return the raw token", () => {
    const token = generateOpaqueToken();
    expect(hashOpaqueToken(token)).not.toBe(token);
  });
});
