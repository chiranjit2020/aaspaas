import { EDITABLE_PLACE_FIELDS, type EditablePlaceField } from "@/lib/validation/placeEdit";
import type { PlaceDoc, PlaceEditDoc } from "@/types/domain";

export type PlaceEditableSnapshot = Pick<PlaceDoc, EditablePlaceField>;

/** The subset of PlaceEditInput that can actually change a place — no `reason`. */
export type ProposedPlaceChanges = Partial<Record<EditablePlaceField, string>>;

/**
 * Pure diff: compares a proposed set of field values against the place's
 * current values and returns only the fields that actually changed, in the
 * `{ field: { old, new } }` shape place_edits stores (§1.3). A field the
 * submitter sent unchanged (same string as what's already published) is
 * dropped rather than recorded as a no-op edit — a moderator reviewing the
 * queue should only ever see genuine proposed changes.
 *
 * Returns an empty object if nothing actually changed; the caller decides
 * what a no-op submission means (currently: reject with 400).
 */
export function diffPlaceEdit(
  current: PlaceEditableSnapshot,
  proposed: ProposedPlaceChanges,
): PlaceEditDoc["changes"] {
  const changes: PlaceEditDoc["changes"] = {};

  for (const field of EDITABLE_PLACE_FIELDS) {
    const newValue = proposed[field];
    if (newValue === undefined) continue;

    const oldValue = current[field];
    if (newValue === oldValue) continue;

    changes[field] = { old: oldValue ?? null, new: newValue };
  }

  return changes;
}

/** Turns an approved edit's `changes` back into a $set-able partial PlaceDoc update. */
export function applyPlaceEditChanges(changes: PlaceEditDoc["changes"]): Partial<PlaceDoc> {
  const update: Partial<Record<EditablePlaceField, string>> = {};
  for (const field of EDITABLE_PLACE_FIELDS) {
    const change = changes[field];
    if (change) update[field] = change.new as string;
  }
  return update;
}
