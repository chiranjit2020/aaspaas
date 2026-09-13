import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import type { checkRateLimit as CheckRateLimitFn } from "@/lib/rateLimit";

// This module talks to Mongo directly (via getDb()), so it's exercised here
// against a real in-memory server rather than mocked — the fixed-window
// upsert logic is exactly the part worth verifying against real Mongo
// semantics (upsert races, $setOnInsert). MONGODB_URI has to be set *before*
// "@/lib/rateLimit" (which imports lib/db/connect.ts) is ever evaluated, since
// connect.ts throws at import time if it's missing — hence the dynamic
// import inside beforeAll rather than a static one at the top of the file.
let mongod: MongoMemoryServer;
let checkRateLimit: typeof CheckRateLimitFn;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  process.env.MONGODB_DB_NAME = "aaspaas_test";
  ({ checkRateLimit } = await import("@/lib/rateLimit"));
}, 60_000);

afterAll(async () => {
  await mongod?.stop();
});

describe("checkRateLimit", () => {
  it("allows requests up to the limit, then blocks", async () => {
    const params = { key: "test:limit", limit: 3, windowMs: 60_000 };
    const results = [
      await checkRateLimit(params),
      await checkRateLimit(params),
      await checkRateLimit(params),
      await checkRateLimit(params),
    ];

    expect(results.filter((r) => r.allowed)).toHaveLength(3);
    expect(results.some((r) => !r.allowed)).toBe(true);
  });

  it("tracks separate keys independently", async () => {
    const a = await checkRateLimit({ key: "independent:a", limit: 1, windowMs: 60_000 });
    const b = await checkRateLimit({ key: "independent:b", limit: 1, windowMs: 60_000 });
    expect(a.allowed).toBe(true);
    expect(b.allowed).toBe(true);
  });

  it("reports remaining count correctly", async () => {
    const params = { key: "test:remaining", limit: 5, windowMs: 60_000 };
    const first = await checkRateLimit(params);
    const second = await checkRateLimit(params);
    expect(first.remaining).toBe(4);
    expect(second.remaining).toBe(3);
  });
});
