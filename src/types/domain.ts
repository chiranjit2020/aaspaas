/**
 * The authoritative AasPaas schema, per 07-roadmap-and-architecture.md §1.3.
 *
 * These types mirror the MongoDB documents field-for-field. Only `Category` and
 * `Place` have live collections wired up in M1 (read-only browse/search); the rest
 * are typed now so later milestones (M2 auth, M3 moderation, M4 reputation, M5 spam
 * scoring) slot in without re-shaping documents that already exist.
 */
import type { ObjectId } from "mongodb";

export type ReputationLevel =
  | "newcomer"
  | "local_explorer"
  | "community_scout"
  | "trusted_contributor"
  | "local_guide";

export type UserRole = "CONTRIBUTOR" | "BUSINESS_OWNER" | "MODERATOR" | "ADMIN";

export type AccountStatus = "active" | "suspended" | "banned";

export interface UserDoc {
  _id: ObjectId;
  displayName: string;
  username: string;
  email: string;
  emailVerified: boolean;
  passwordHash: string;
  roles: UserRole[];
  locality?: string;
  district?: string;
  reputationLevel: ReputationLevel;
  stats: {
    placesAdded: number;
    placesVerified: number;
    correctionsMade: number;
    reportsFiled: number;
    usefulVotesReceived: number;
    rejectedSubmissions: number;
    spamReportsAgainst: number;
  };
  accountStatus: AccountStatus;
  /**
   * Set when a place submission or edit proposal scores in spamScore.ts's
   * top tier (76-100) — a temporary, automatic penalty on *future*
   * submissions, never a suspension/ban (per §2.2: "the score routes a
   * submission. It never bans, suspends, or deletes an account."). Cleared
   * by the passage of time, not by a moderator action.
   */
  submissionCooldownUntil?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt?: Date;
}

export interface EmailVerificationTokenDoc {
  _id: ObjectId;
  userId: ObjectId;
  tokenHash: string;
  expiresAt: Date;
  usedAt?: Date;
  createdAt: Date;
}

export interface RefreshTokenDoc {
  _id: ObjectId;
  userId: ObjectId;
  tokenHash: string;
  issuedAt: Date;
  expiresAt: Date;
  revoked: boolean;
  userAgent?: string;
}

/** Rate-limit counters — fixed-window, per roadmap §2.1. */
export interface RateLimitCounterDoc {
  _id: string;
  count: number;
  windowStart: Date;
  expiresAt: Date;
}

export interface CategoryDoc {
  _id: ObjectId;
  slug: string;
  name: string;
  parentCategoryId?: ObjectId | null;
  icon: string;
  /** e.g. "plumber" matches "fix my tap" — see lib/search/parseQuery.ts */
  synonyms: string[];
}

export type PlaceStatus = "pending" | "published" | "flagged" | "rejected" | "removed";

export interface GeoPoint {
  type: "Point";
  /** [lng, lat] — GeoJSON order, not [lat, lng]. */
  coordinates: [number, number];
}

export interface PlaceDoc {
  _id: ObjectId;
  name: string;
  slug: string;
  categoryId: ObjectId;
  description?: string;
  phone?: string;
  district: string;
  locality: string;
  pincode: string;
  location: GeoPoint;
  address?: string;
  createdBy: ObjectId | null;
  /** Reserved for Phase 5 (claiming). Untouched in V1. */
  ownerId: ObjectId | null;
  status: PlaceStatus;
  spamScore: number;
  /** computeSpamScore's human-readable reasons at submission time — the moderator watchlist's whole point. */
  spamReasons?: string[];
  verificationCount: number;
  usefulCount: number;
  notUsefulCount: number;
  duplicateOfPlaceId?: ObjectId | null;
  /**
   * Set by a moderator from the spam-score watchlist (§2.2's 21-50 band —
   * "published, flagged=true") once they've looked at it and decided it's
   * fine. Clears the item from the watchlist without touching spamScore
   * itself, which stays as an honest historical record for audit. Absent
   * (not just falsy) means "never reviewed."
   */
  spamReviewedAt?: Date | null;
  /** Reserved for Phase 7 (monetization). */
  tier: "free";
  createdAt: Date;
  updatedAt: Date;
}

export interface PlacePhotoDoc {
  _id: ObjectId;
  placeId: ObjectId;
  url: string;
  uploadedBy: ObjectId;
  uploadedAt: Date;
  moderationStatus: "pending" | "approved" | "rejected";
}

export interface PlaceEditDoc {
  _id: ObjectId;
  placeId: ObjectId;
  userId: ObjectId;
  changes: Record<string, { old: unknown; new: unknown }>;
  reason?: string;
  status: "pending" | "approved" | "rejected";
  reviewedBy?: ObjectId;
  /**
   * spamScore.ts's score for this specific edit proposal — kept on the edit
   * document, not the place's own spamScore, so each document's audit trail
   * stays scoped to the thing it actually scored (see M5's commit notes for
   * why this reads as a deliberate call, not an oversight).
   */
  spamScore?: number;
  createdAt: Date;
}

export type ReportReason =
  | "duplicate"
  | "closed"
  | "wrong_info"
  | "spam"
  | "inappropriate"
  | "other";

export interface ReportDoc {
  _id: ObjectId;
  placeId: ObjectId;
  userId: ObjectId;
  reason: ReportReason;
  details?: string;
  status: "open" | "reviewing" | "resolved";
  resolvedBy?: ObjectId;
  resolution?: "kept" | "corrected" | "removed";
  createdAt: Date;
}

export interface UsefulVoteDoc {
  _id: ObjectId;
  placeId: ObjectId;
  userId: ObjectId;
  value: "useful" | "not_useful";
  createdAt: Date;
}

export interface ModerationActionDoc {
  _id: ObjectId;
  actorId: ObjectId;
  action: string;
  targetType: "place" | "place_edit" | "report" | "user";
  targetId: ObjectId;
  notes?: string;
  createdAt: Date;
}

/** Shapes returned to the client — never the raw Mongo documents. */
export interface PlaceSummary {
  id: string;
  name: string;
  slug: string;
  category: { id: string; slug: string; name: string; icon: string };
  district: string;
  locality: string;
  pincode: string;
  phone?: string;
  usefulCount: number;
  notUsefulCount: number;
  /** Populated only by a near-me ($geoNear) search; meters, rounded. */
  distanceMeters?: number;
  /**
   * Raw, unrounded coordinates — deliberately public as of Phase 4
   * (Geo/Maps). A business's address is already public product data,
   * effectively reachable via the "Directions"/"View on map" links every
   * place page has shown since M2; this reverses the earlier "never expose
   * raw lat/lng" stance recorded in this file's git history and
   * 08-hardening-audit.md's PII-exposure row, which now carries a dated
   * addendum pointing back here.
   */
  location: { lat: number; lng: number };
  /**
   * Null only if createdBy points at an account that no longer exists. On
   * PlaceSummary (search results/cards) deliberately excludes reputationLevel
   * — originally because every account was "newcomer" until M4's reputation
   * calculation existed for real, and showing a level that never changed
   * would look like a broken leveling system rather than an honest one.
   * lib/trust/reputation.ts computes real levels now (2026-09-15), so that
   * reasoning no longer applies — whether to surface a level badge on
   * search result cards is now an open product decision, not blocked by
   * missing data.
   */
  contributor: { username: string; displayName: string } | null;
}

export interface PlaceDetail extends PlaceSummary {
  description?: string;
  address?: string;
  /**
   * Kept as a convenience text fallback for the "Directions"/"View on map"
   * external links (a maps provider geocodes it directly) — not a privacy
   * boundary. As of Phase 4 (Geo/Maps), PlaceSummary.location (inherited
   * here) already carries this place's raw coordinates publicly; see that
   * field's doc comment for why that's now deliberate.
   */
  mapQuery: string;
  verificationCount: number;
  createdAt: string;
}

/**
 * The user's own profile (`GET /api/users/me`) — never includes passwordHash.
 * A user seeing their own email is fine; the §2 PII rule ("locality only,
 * never lat/lng or email") is about the future *public* profile
 * (`/api/users/[username]`, M4), which must build its own, narrower shape.
 */
export interface UserProfile {
  id: string;
  displayName: string;
  username: string;
  email: string;
  emailVerified: boolean;
  roles: UserRole[];
  locality?: string;
  district?: string;
  reputationLevel: ReputationLevel;
  stats: UserDoc["stats"];
  createdAt: string;
}

/**
 * The PUBLIC contributor profile (`GET /api/users/[username]`, `/u/[username]`).
 * Deliberately minimal, per review.md's Part 15 and the design-system
 * philosophy's own rule against fake gamification: no email, no
 * reputationLevel, no XP, no badges. placesAddedCount is a live count of
 * *published* places only, not the stats.placesAdded submission counter —
 * a public "accomplishment" number should reflect what actually made it
 * into the directory, not raw submission attempts (pending or rejected ones
 * included).
 *
 * reputationLevel's exclusion originally had a second reason beyond the
 * anti-gamification rule: every account was "newcomer" forever (M4's
 * reputation calculation didn't exist), so showing a level would have
 * looked like a broken leveling system. lib/trust/reputation.ts computes
 * real levels now (2026-09-15) — that specific reason is gone, but the
 * anti-gamification rule stands on its own regardless, so nothing here
 * needs to change unless a deliberate product decision adds a level badge.
 */
export interface PublicProfile {
  displayName: string;
  username: string;
  locality?: string;
  district?: string;
  memberSince: string;
  placesAddedCount: number;
}
