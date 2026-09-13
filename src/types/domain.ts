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
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt?: Date;
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
  verificationCount: number;
  usefulCount: number;
  notUsefulCount: number;
  duplicateOfPlaceId?: ObjectId | null;
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
  distanceMeters?: number;
}

export interface PlaceDetail extends PlaceSummary {
  description?: string;
  address?: string;
  location: { lat: number; lng: number };
  verificationCount: number;
  createdAt: string;
}
