import type { CategoryDoc, PlaceDoc, PlaceDetail, PlaceSummary, UserDoc, UserProfile } from "@/types/domain";

export interface Contributor {
  username: string;
  displayName: string;
}

export interface CategorySummary {
  id: string;
  slug: string;
  name: string;
  icon: string;
  parentCategoryId: string | null;
  synonyms: string[];
}

export function toCategorySummary(doc: CategoryDoc): CategorySummary {
  return {
    id: doc._id.toHexString(),
    slug: doc.slug,
    name: doc.name,
    icon: doc.icon,
    parentCategoryId: doc.parentCategoryId ? doc.parentCategoryId.toHexString() : null,
    synonyms: doc.synonyms,
  };
}

export function toPlaceSummary(
  doc: PlaceDoc,
  category: CategoryDoc | undefined,
  contributor: Contributor | null,
): PlaceSummary {
  return {
    id: doc._id.toHexString(),
    name: doc.name,
    slug: doc.slug,
    category: category
      ? { id: category._id.toHexString(), slug: category.slug, name: category.name, icon: category.icon }
      : { id: doc.categoryId.toHexString(), slug: "unknown", name: "Unknown", icon: "help-circle" },
    district: doc.district,
    locality: doc.locality,
    pincode: doc.pincode,
    phone: doc.phone,
    usefulCount: doc.usefulCount,
    notUsefulCount: doc.notUsefulCount,
    contributor,
  };
}

export function toUserProfile(doc: UserDoc): UserProfile {
  return {
    id: doc._id.toHexString(),
    displayName: doc.displayName,
    username: doc.username,
    email: doc.email,
    emailVerified: doc.emailVerified,
    roles: doc.roles,
    locality: doc.locality,
    district: doc.district,
    reputationLevel: doc.reputationLevel,
    stats: doc.stats,
    createdAt: doc.createdAt.toISOString(),
  };
}

export function toPlaceDetail(
  doc: PlaceDoc,
  category: CategoryDoc | undefined,
  contributor: Contributor | null,
): PlaceDetail {
  return {
    ...toPlaceSummary(doc, category, contributor),
    description: doc.description,
    address: doc.address,
    mapQuery: [doc.name, doc.address, doc.locality, doc.district]
      .filter(Boolean)
      .join(", "),
    verificationCount: doc.verificationCount,
    createdAt: doc.createdAt.toISOString(),
  };
}
