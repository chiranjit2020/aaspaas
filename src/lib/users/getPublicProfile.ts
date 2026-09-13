import type { ObjectId } from "mongodb";
import { getUsersCollection } from "@/lib/db/models/user";
import { getPlacesCollection } from "@/lib/db/models/place";
import type { PublicProfile } from "@/types/domain";

export interface PublicProfileLookup {
  profile: PublicProfile;
  /** For the page's own follow-up "places by this contributor" query — never
   * serialize this into an API response, only PublicProfile is public. */
  userId: ObjectId;
}

/**
 * Shared by GET /api/users/[username] and the /u/[username] page, so the
 * page doesn't round-trip through its own API route (same pattern as
 * getPlaceById.ts).
 *
 * Never selects passwordHash, email, emailVerified, roles or accountStatus
 * from the user document — this is the one place in the codebase that's
 * allowed to leak nothing, since it's the actual public-facing shape.
 */
export async function getPublicProfile(username: string): Promise<PublicProfileLookup | null> {
  const users = await getUsersCollection();
  const user = await users.findOne(
    { username: username.toLowerCase() },
    { projection: { displayName: 1, username: 1, locality: 1, district: 1, createdAt: 1 } },
  );
  if (!user) return null;

  const places = await getPlacesCollection();
  const placesAddedCount = await places.countDocuments({
    createdBy: user._id,
    status: "published",
  });

  return {
    profile: {
      displayName: user.displayName,
      username: user.username,
      locality: user.locality,
      district: user.district,
      memberSince: user.createdAt.toISOString(),
      placesAddedCount,
    },
    userId: user._id,
  };
}
