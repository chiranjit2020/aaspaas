import { z } from "zod";

export const editDecisionSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  notes: z.string().trim().max(500).optional(),
});

export type EditDecisionInput = z.infer<typeof editDecisionSchema>;
