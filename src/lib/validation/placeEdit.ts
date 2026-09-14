import { z } from "zod";

/**
 * "Suggest an edit" input — a partial version of the same editable fields
 * as placeInputSchema (see lib/validation/place.ts), minus categorySlug and
 * lat/lng.
 *
 * categorySlug is left out of M4's scope deliberately (recategorization is a
 * bigger, rarer correction than the wording/contact-detail fixes this flow
 * targets — a clean follow-up later, not a reason to widen this milestone).
 *
 * lat/lng are left out here not because coordinates are hidden — Phase 4
 * (Geo/Maps) made PlaceDetail.location public — but because moving a pin is
 * a bigger, rarer correction than the wording/contact-detail fixes this flow
 * targets, same reasoning as categorySlug above. A clean follow-up later,
 * not part of Phase 4's decided scope.
 */
export const placeEditInputSchema = z
  .object({
    name: z.string().trim().min(2).max(140).optional(),
    description: z.string().trim().max(1000).optional(),
    phone: z
      .string()
      .trim()
      .regex(/^[0-9+\-\s()]{7,20}$/, "not a plausible phone number")
      .optional(),
    district: z.string().trim().min(2).max(120).optional(),
    locality: z.string().trim().min(2).max(120).optional(),
    pincode: z.string().trim().regex(/^\d{6}$/, "pincode must be 6 digits").optional(),
    address: z.string().trim().max(300).optional(),
    reason: z.string().trim().max(300).optional(),
  })
  .refine(
    (data) =>
      Object.keys(data).some(
        (key) => key !== "reason" && data[key as keyof typeof data] !== undefined,
      ),
    { message: "Propose at least one change." },
  );

export type PlaceEditInput = z.infer<typeof placeEditInputSchema>;

/** The subset of placeEditInputSchema that can actually land on a PlaceDoc. */
export const EDITABLE_PLACE_FIELDS = [
  "name",
  "description",
  "phone",
  "district",
  "locality",
  "pincode",
  "address",
] as const;

export type EditablePlaceField = (typeof EDITABLE_PLACE_FIELDS)[number];
