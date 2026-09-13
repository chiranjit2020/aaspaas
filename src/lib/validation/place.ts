import { z } from "zod";

/**
 * Shape of a place submission. Used by scripts/seed.ts today (so seed data is held
 * to the same bar as a real submission) and by `POST /api/places` from M2 onward —
 * the same schema drives both the API route and, later, the client-side form.
 */
export const placeInputSchema = z.object({
  name: z.string().trim().min(2).max(140),
  categorySlug: z.string().trim().min(1),
  description: z.string().trim().max(1000).optional(),
  phone: z
    .string()
    .trim()
    .regex(/^[0-9+\-\s()]{7,20}$/, "not a plausible phone number")
    .optional(),
  district: z.string().trim().min(2).max(120),
  locality: z.string().trim().min(2).max(120),
  pincode: z.string().trim().regex(/^\d{6}$/, "pincode must be 6 digits"),
  address: z.string().trim().max(300).optional(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  /**
   * Set by the client on a resubmit after seeing a "possible duplicate"
   * warning (see lib/trust/duplicateDetection.ts) and choosing "create it
   * anyway." Absent/false on a first attempt.
   */
  acknowledgeDuplicates: z.boolean().optional(),
});

export type PlaceInput = z.infer<typeof placeInputSchema>;
