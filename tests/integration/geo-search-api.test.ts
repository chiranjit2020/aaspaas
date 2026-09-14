import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";

/**
 * Exercises the Phase 4 (Geo/Maps) near-me radius search end to end — GET
 * /api/search and GET /api/places both funnel through the same
 * searchPlaces() -> buildGeoSearchPipeline() $geoNear path.
 *
 * As with places-api.test.ts, env vars must be set *before* any module that
 * reads them is imported — hence everything routes/lib-dependent is loaded
 * dynamically inside beforeAll. This test's beforeAll also explicitly
 * creates the location 2dsphere index: scripts/createIndexes.ts never runs
 * against this ephemeral in-memory database, and $geoNear requires it —
 * this test run is also the concrete confirmation that mongodb-memory-
 * server's bundled mongod actually supports $geoNear/2dsphere, not an
 * assumption.
 */
let mongod: MongoMemoryServer;
let searchGET: typeof import("@/app/api/search/route").GET;
let placesGET: typeof import("@/app/api/places/route").GET;

// A fixed reference point plus places at known, well-separated distances
// from it (1 degree of latitude is ~111.3km at this latitude), so
// inclusion/exclusion and ordering assertions don't depend on exact
// $geoNear distance math, only on being clearly inside or outside a
// radiusKm=5 (5000m) cutoff.
const ORIGIN = { lat: 22.85, lng: 88.66 };
const PLACES = [
  { name: "Origin Shop", latOffset: 0, distanceRank: 0 },
  { name: "Electronics Repair", latOffset: 0.005, distanceRank: 1 }, // ~0.56km
  { name: "Grocery Store", latOffset: 0.006, distanceRank: 2 }, // ~0.67km
  { name: "North Shop B", latOffset: 0.01, distanceRank: 3 }, // ~1.11km
  { name: "North Shop C", latOffset: 0.02, distanceRank: 4 }, // ~2.23km
  { name: "Far Shop D", latOffset: 0.05, distanceRank: 5 }, // ~5.57km — just past the 5km cutoff
  { name: "Very Far Shop E", latOffset: 0.5, distanceRank: 6 }, // ~55.7km — well outside any radius used here
];
// Ascending-distance names for everything within a 5km radius.
const EXPECTED_WITHIN_5KM = ["Origin Shop", "Electronics Repair", "Grocery Store", "North Shop B", "North Shop C"];

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  process.env.MONGODB_DB_NAME = "aaspaas_test";
  process.env.JWT_ACCESS_SECRET = "test-secret-do-not-use-in-real-life";

  ({ GET: searchGET } = await import("@/app/api/search/route"));
  ({ GET: placesGET } = await import("@/app/api/places/route"));

  const { getCategoriesCollection } = await import("@/lib/db/models/category");
  const { getPlacesCollection } = await import("@/lib/db/models/place");

  const categories = await getCategoriesCollection();
  const categoryId = new ObjectId();
  await categories.insertOne({
    _id: categoryId,
    slug: "shop",
    name: "Shop",
    icon: "store",
    synonyms: ["shop"],
  });

  const places = await getPlacesCollection();
  // $geoNear requires this index; createIndexes.ts never runs against this
  // ephemeral database.
  await places.createIndex({ location: "2dsphere" });

  const now = new Date();
  for (const p of PLACES) {
    await places.insertOne({
      _id: new ObjectId(),
      name: p.name,
      slug: p.name.toLowerCase().replace(/\s+/g, "-"),
      categoryId,
      district: "North 24 Parganas",
      locality: "Habra",
      pincode: "743263",
      location: { type: "Point", coordinates: [ORIGIN.lng, ORIGIN.lat + p.latOffset] },
      createdBy: null,
      ownerId: null,
      status: "published",
      spamScore: 0,
      verificationCount: 0,
      usefulCount: 0,
      notUsefulCount: 0,
      tier: "free",
      createdAt: now,
      updatedAt: now,
    });
  }
}, 60_000);

afterAll(async () => {
  await mongod?.stop();
});

function searchRequest(params: Record<string, string>) {
  return new NextRequest(`http://localhost/api/search?${new URLSearchParams(params).toString()}`);
}

function placesRequest(params: Record<string, string>) {
  return new NextRequest(`http://localhost/api/places?${new URLSearchParams(params).toString()}`);
}

describe("GET /api/search — near-me radius search", () => {
  it("returns only places within radiusKm, sorted nearest-first", async () => {
    const res = await searchGET(
      searchRequest({ lat: String(ORIGIN.lat), lng: String(ORIGIN.lng), radiusKm: "5" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items.map((p: { name: string }) => p.name)).toEqual(EXPECTED_WITHIN_5KM);
  });

  it("populates location and a rounded distanceMeters on every result", async () => {
    const res = await searchGET(
      searchRequest({ lat: String(ORIGIN.lat), lng: String(ORIGIN.lng), radiusKm: "5" }),
    );
    const body = await res.json();
    const origin = body.items.find((p: { name: string }) => p.name === "Origin Shop");
    expect(origin.location).toEqual({ lat: ORIGIN.lat, lng: ORIGIN.lng });
    expect(typeof origin.distanceMeters).toBe("number");
    expect(Number.isInteger(origin.distanceMeters)).toBe(true);
    expect(origin.distanceMeters).toBeLessThan(5);

    for (const item of body.items) {
      expect(typeof item.distanceMeters).toBe("number");
    }
  });

  it("paginates via a distanceMeters cursor with no duplicates or omissions", async () => {
    const collected: string[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < EXPECTED_WITHIN_5KM.length + 1; i++) {
      const params: Record<string, string> = {
        lat: String(ORIGIN.lat),
        lng: String(ORIGIN.lng),
        radiusKm: "5",
        limit: "1",
      };
      if (cursor) params.cursor = cursor;
      const res = await searchGET(searchRequest(params));
      const body = await res.json();
      expect(body.items).toHaveLength(1);
      collected.push(body.items[0].name);
      cursor = body.nextCursor;
      if (!cursor) break;
    }
    expect(collected).toEqual(EXPECTED_WITHIN_5KM);
    expect(cursor).toBeFalsy();
  });

  it("filters free text via prefix regex, not $text — no text index exists on this collection", async () => {
    const res = await searchGET(
      searchRequest({ lat: String(ORIGIN.lat), lng: String(ORIGIN.lng), radiusKm: "5", q: "Electronics" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items.map((p: { name: string }) => p.name)).toEqual(["Electronics Repair"]);
  });

  it("rejects lat without lng with a 400", async () => {
    const res = await searchGET(searchRequest({ lat: String(ORIGIN.lat) }));
    expect(res.status).toBe(400);
  });

  it("excludes places outside radiusKm entirely", async () => {
    const res = await searchGET(
      searchRequest({ lat: String(ORIGIN.lat), lng: String(ORIGIN.lng), radiusKm: "5" }),
    );
    const body = await res.json();
    const names = body.items.map((p: { name: string }) => p.name);
    expect(names).not.toContain("Far Shop D");
    expect(names).not.toContain("Very Far Shop E");
  });
});

describe("GET /api/places — near-me radius search (shared code path)", () => {
  it("supports the same lat/lng/radiusKm params as /api/search, with no q", async () => {
    const res = await placesGET(
      placesRequest({ lat: String(ORIGIN.lat), lng: String(ORIGIN.lng), radiusKm: "5" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items.map((p: { name: string }) => p.name)).toEqual(EXPECTED_WITHIN_5KM);
  });
});
