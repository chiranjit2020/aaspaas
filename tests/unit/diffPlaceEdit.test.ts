import { describe, expect, it } from "vitest";
import { applyPlaceEditChanges, diffPlaceEdit } from "@/lib/places/diffPlaceEdit";

const CURRENT = {
  name: "Sri Mobile Point",
  description: "Screen repair, battery replacement",
  phone: "9830000000",
  district: "North 24 Parganas",
  locality: "Habra",
  pincode: "743263",
  address: "Station Road",
};

describe("diffPlaceEdit", () => {
  it("returns an empty object when nothing changed", () => {
    expect(diffPlaceEdit(CURRENT, { name: "Sri Mobile Point" })).toEqual({});
  });

  it("returns an empty object when no fields were proposed at all", () => {
    expect(diffPlaceEdit(CURRENT, {})).toEqual({});
  });

  it("only records fields that actually changed", () => {
    const changes = diffPlaceEdit(CURRENT, {
      name: "Sri Mobile Point",
      phone: "9831111111",
    });
    expect(changes).toEqual({
      phone: { old: "9830000000", new: "9831111111" },
    });
  });

  it("records multiple changed fields", () => {
    const changes = diffPlaceEdit(CURRENT, {
      locality: "Ashoknagar",
      pincode: "743222",
    });
    expect(changes).toEqual({
      locality: { old: "Habra", new: "Ashoknagar" },
      pincode: { old: "743263", new: "743222" },
    });
  });

  it("records old as null for a currently-unset optional field", () => {
    const changes = diffPlaceEdit(
      { ...CURRENT, description: undefined as unknown as string },
      { description: "Now with home pickup" },
    );
    expect(changes).toEqual({
      description: { old: null, new: "Now with home pickup" },
    });
  });
});

describe("applyPlaceEditChanges", () => {
  it("turns a changes object back into a flat partial update", () => {
    const update = applyPlaceEditChanges({
      phone: { old: "9830000000", new: "9831111111" },
      locality: { old: "Habra", new: "Ashoknagar" },
    });
    expect(update).toEqual({ phone: "9831111111", locality: "Ashoknagar" });
  });

  it("returns an empty object for empty changes", () => {
    expect(applyPlaceEditChanges({})).toEqual({});
  });
});
