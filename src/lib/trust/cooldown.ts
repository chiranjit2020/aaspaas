/**
 * Pure cooldown check — the write side (setting submissionCooldownUntil) is
 * a one-line $set in the routes that need it, no DB wrapper worth adding.
 *
 * §2.2's "24-72h submission cooldown" is a range, not a formula; 48h is the
 * midpoint, applied flat rather than scaled by score-above-threshold — V1
 * doesn't need finer granularity than "you're paused for two days."
 */
export const SPAM_REJECTION_COOLDOWN_HOURS = 48;

export function isCooldownActive(
  until: Date | null | undefined,
  now: Date = new Date(),
): boolean {
  return Boolean(until && until.getTime() > now.getTime());
}

export function cooldownRemainingMs(until: Date, now: Date = new Date()): number {
  return Math.max(0, until.getTime() - now.getTime());
}
