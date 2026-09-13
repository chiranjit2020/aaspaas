import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import { decodeCursor, encodeCursor, buildCursorMatchStage } from "@/lib/search/rank";

describe("cursor encode/decode", () => {
  it("round-trips a cursor", () => {
    const id = new ObjectId().toHexString();
    const encoded = encodeCursor({ rankScore: 3.14, id });
    const decoded = decodeCursor(encoded);
    expect(decoded).toEqual({ rankScore: 3.14, id });
  });

  it("rejects garbage input instead of throwing", () => {
    expect(decodeCursor("not-base64-json")).toBeNull();
    expect(decodeCursor(Buffer.from("{}").toString("base64url"))).toBeNull();
  });

  it("rejects a cursor with a malformed id", () => {
    const bad = Buffer.from(JSON.stringify({ rankScore: 1, id: "nope" })).toString(
      "base64url",
    );
    expect(decodeCursor(bad)).toBeNull();
  });
});

describe("buildCursorMatchStage", () => {
  it("builds an $expr comparing rankScore and _id as a tiebreaker", () => {
    const id = new ObjectId().toHexString();
    const stage = buildCursorMatchStage({ rankScore: 2, id });
    expect(stage.$match.$expr.$or).toHaveLength(2);
    expect(stage.$match.$expr.$or[0]).toEqual({ $lt: ["$rankScore", 2] });
  });
});
