import type { ReputationLevel } from "@/types/domain";

/**
 * Plain title-case display labels — no display-label mapping existed
 * anywhere before this; every call site used the raw enum value. Kept
 * deliberately plain (a name, not a badge/icon/color) per PublicProfile's
 * own anti-gamification rule (src/types/domain.ts) — showing a level on
 * the user's own dashboard is fine, dressing it up as a game mechanic isn't.
 */
export const REPUTATION_LEVEL_LABELS: Record<ReputationLevel, string> = {
  newcomer: "Newcomer",
  local_explorer: "Local Explorer",
  community_scout: "Community Scout",
  trusted_contributor: "Trusted Contributor",
  local_guide: "Local Guide",
};
