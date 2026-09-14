import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import { decodeCursor, encodeCursor, buildCursorMatchStage } from "@/lib/search/rank";

describe("cursor encode/decode", () => {
  it("round-trips a rankScore cursor", () => {
    const id = new ObjectId().toHexString();
    const encoded = encodeCursor({ field: "rankScore", value: 3.14, id });
    const decoded = decodeCursor(encoded);
    expect(decoded).toEqual({ field: "rankScore", value: 3.14, id });
  });

  it("round-trips a distanceMeters cursor", () => {
    const id = new ObjectId().toHexString();
    const encoded = encodeCursor({ field: "distanceMeters", value: 1234, id });
    const decoded = decodeCursor(encoded);
    expect(decoded).toEqual({ field: "distanceMeters", value: 1234, id });
  });

  it("rejects garbage input instead of throwing", () => {
    expect(decodeCursor("not-base64-json")).toBeNull();
    expect(decodeCursor(Buffer.from("{}").toString("base64url"))).toBeNull();
  });

  it("rejects a cursor with a malformed id", () => {
    const bad = Buffer.from(
      JSON.stringify({ field: "rankScore", value: 1, id: "nope" }),
    ).toString("base64url");
    expect(decodeCursor(bad)).toBeNull();
  });

  it("rejects a cursor with an unknown sort field", () => {
    const bad = Buffer.from(
      JSON.stringify({ field: "popularity", value: 1, id: new ObjectId().toHexString() }),
    ).toString("base64url");
    expect(decodeCursor(bad)).toBeNull();
  });
});

describe("buildCursorMatchStage", () => {
  it("uses $lt for rankScore (best-first, descending)", () => {
    const id = new ObjectId().toHexString();
    const stage = buildCursorMatchStage({ field: "rankScore", value: 2, id });
    expect(stage.$match.$expr.$or).toHaveLength(2);
    expect(stage.$match.$expr.$or[0]).toEqual({ $lt: ["$rankScore", 2] });
  });

  it("uses $gt for distanceMeters (nearest-first, ascending)", () => {
    const id = new ObjectId().toHexString();
    const stage = buildCursorMatchStage({ field: "distanceMeters", value: 500, id });
    expect(stage.$match.$expr.$or).toHaveLength(2);
    expect(stage.$match.$expr.$or[0]).toEqual({ $gt: ["$distanceMeters", 500] });
  });
});
