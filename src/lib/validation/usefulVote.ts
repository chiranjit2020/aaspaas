import { z } from "zod";

export const usefulVoteInputSchema = z.object({
  value: z.enum(["useful", "not_useful"]),
});

export type UsefulVoteInput = z.infer<typeof usefulVoteInputSchema>;
