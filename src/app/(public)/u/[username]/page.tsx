import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CalendarDays, MapPin } from "lucide-react";
import { getPublicProfile } from "@/lib/users/getPublicProfile";
import { getPlacesCollection } from "@/lib/db/models/place";
import { getCategoriesCollection } from "@/lib/db/models/category";
import { toPlaceSummary } from "@/lib/db/serialize";
import { ContributorAvatar } from "@/components/places/contributor-avatar";
import { PlaceCard } from "@/components/places/place-card";

interface ProfilePageProps {
  params: Promise<{ username: string }>;
}

export async function generateMetadata({ params }: ProfilePageProps): Promise<Metadata> {
  const { username } = await params;
  const result = await getPublicProfile(username);
  if (!result) return { title: "Contributor not found — AasPaas" };
  const { profile } = result;
  return {
    title: `${profile.displayName} (@${profile.username}) — AasPaas`,
    description: `${profile.placesAddedCount} place${profile.placesAddedCount === 1 ? "" : "s"} added to AasPaas by @${profile.username}.`,
  };
}

const MONTH_YEAR = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" });

export default async function ProfilePage({ params }: ProfilePageProps) {
  const { username } = await params;
  const result = await getPublicProfile(username);
  if (!result) notFound();
  const { profile, userId } = result;

  const [places, categories] = await Promise.all([
    getPlacesCollection(),
    getCategoriesCollection(),
  ]);

  // §2's "page size capped at 50" mitigation — a prolific contributor's
  // profile shouldn't render an unbounded list on a public, unauthenticated
  // page. 50 is generous for what's meant to be a highlights view, not a
  // full paginated archive (that's a fine follow-up if it's ever needed).
  const placeDocs = await places
    .find({ createdBy: userId, status: "published" })
    .sort({ createdAt: -1 })
    .limit(50)
    .toArray();

  const categoryDocs = await categories
    .find({ _id: { $in: placeDocs.map((p) => p.categoryId) } })
    .toArray();
  const categoriesById = new Map(categoryDocs.map((c) => [c._id.toHexString(), c]));

  // Every place here has the same creator — no batched lookup needed, unlike
  // searchPlaces which serves places from many different contributors.
  const contributor = { username: profile.username, displayName: profile.displayName };
  const contributedPlaces = placeDocs.map((doc) =>
    toPlaceSummary(doc, categoriesById.get(doc.categoryId.toHexString()), contributor),
  );

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="mb-8 flex items-center gap-4">
        <ContributorAvatar displayName={profile.displayName} size="lg" />
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{profile.displayName}</h1>
          <p className="text-sm text-muted-foreground">@{profile.username}</p>
        </div>
      </div>

      <div className="mb-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
        {profile.locality && (
          <span className="flex items-center gap-1.5">
            <MapPin className="size-4 text-location" />
            {profile.locality}
            {profile.district && profile.district !== profile.locality ? `, ${profile.district}` : ""}
          </span>
        )}
        <span className="flex items-center gap-1.5">
          <CalendarDays className="size-4" />
          Member since {MONTH_YEAR.format(new Date(profile.memberSince))}
        </span>
        <span className="font-medium text-foreground">
          {profile.placesAddedCount} place{profile.placesAddedCount === 1 ? "" : "s"} added
        </span>
      </div>

      <h2 className="mb-4 text-lg font-semibold">Places added by @{profile.username}</h2>
      {contributedPlaces.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing published yet.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {contributedPlaces.map((place) => (
            <PlaceCard key={place.id} place={place} />
          ))}
        </div>
      )}
    </div>
  );
}
