import { z } from "zod";

export const REPORT_REASONS = [
  "duplicate",
  "closed",
  "wrong_info",
  "spam",
  "inappropriate",
  "other",
] as const;

export const reportInputSchema = z.object({
  reason: z.enum(REPORT_REASONS),
  details: z.string().trim().max(500).optional(),
});

export type ReportInput = z.infer<typeof reportInputSchema>;

export const reportResolutionSchema = z.object({
  resolution: z.enum(["kept", "corrected", "removed"]),
  notes: z.string().trim().max(500).optional(),
});

export type ReportResolutionInput = z.infer<typeof reportResolutionSchema>;
