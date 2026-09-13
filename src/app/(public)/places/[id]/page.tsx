import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MapPin, Phone, ArrowLeft, Navigation } from "lucide-react";
import { getPlaceById } from "@/lib/places/getPlaceById";
import { getUserVoteForPlace } from "@/lib/places/getUserVoteForPlace";
import { getCurrentUserFromCookieStore } from "@/lib/auth/session";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { CategoryIcon } from "@/components/places/category-icon";
import { ContributorAvatar } from "@/components/places/contributor-avatar";
import { UsefulVoteButtons } from "@/components/places/useful-vote-buttons";
import { SuggestEditSheet } from "@/components/places/suggest-edit-sheet";
import { ReportSheet } from "@/components/places/report-sheet";

interface PlacePageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PlacePageProps): Promise<Metadata> {
  const { id } = await params;
  const place = await getPlaceById(id);
  if (!place) return { title: "Place not found — AasPaas" };
  return {
    title: `${place.name} — ${place.locality} | AasPaas`,
    description: place.description ?? `${place.category.name} in ${place.locality}, ${place.district}.`,
  };
}

export default async function PlacePage({ params }: PlacePageProps) {
  const { id } = await params;
  const place = await getPlaceById(id);
  if (!place) notFound();

  const session = await getCurrentUserFromCookieStore();
  const yourVote = session ? await getUserVoteForPlace(place.id, session.sub) : null;
  const isOwnSubmission = Boolean(session && place.contributor?.username === session.username);
  const loginRedirectTo = `/places/${place.slug}`;

  // Text-based (name + address), not the stored lat/lng — exact coordinates
  // aren't exposed publicly until the geo/maps phase (Phase 4). The maps
  // provider geocodes the text itself.
  const mapQuery = encodeURIComponent(place.mapQuery);
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${mapQuery}`;
  const mapViewUrl = `https://www.openstreetmap.org/search?query=${mapQuery}`;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to search
      </Link>

      <div className="space-y-4">
        <div>
          <Badge variant="secondary" className="mb-3 gap-1.5 font-normal">
            <CategoryIcon name={place.category.icon} className="size-3.5" />
            {place.category.name}
          </Badge>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{place.name}</h1>
        </div>

        <div className="flex items-start gap-1.5 text-muted-foreground">
          <MapPin className="mt-0.5 size-4 shrink-0 text-location" />
          <span>
            {place.address ? `${place.address}, ` : ""}
            {place.locality}, {place.district} &mdash; {place.pincode}
          </span>
        </div>

        {place.description && <p className="text-sm leading-relaxed">{place.description}</p>}

        <div className="flex flex-wrap gap-3 pt-2">
          {place.phone && (
            <Button asChild>
              <a href={`tel:${place.phone}`}>
                <Phone className="size-4" />
                Call {place.phone}
              </a>
            </Button>
          )}
          <Button variant="outline" asChild>
            <a href={directionsUrl} target="_blank" rel="noopener noreferrer">
              <Navigation className="size-4" />
              Directions
            </a>
          </Button>
          <Button variant="ghost" asChild>
            <a href={mapViewUrl} target="_blank" rel="noopener noreferrer">
              View on map
            </a>
          </Button>
        </div>

        <Separator />

        <UsefulVoteButtons
          placeId={place.id}
          isAuthenticated={Boolean(session)}
          isOwnSubmission={isOwnSubmission}
          initialUsefulCount={place.usefulCount}
          initialNotUsefulCount={place.notUsefulCount}
          initialVote={yourVote}
          loginRedirectTo={loginRedirectTo}
        />
        {place.verificationCount > 0 && (
          <p className="text-sm text-success">{place.verificationCount} verifications</p>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <SuggestEditSheet
            placeId={place.id}
            current={{
              name: place.name,
              description: place.description,
              phone: place.phone,
              district: place.district,
              locality: place.locality,
              pincode: place.pincode,
              address: place.address,
            }}
            isAuthenticated={Boolean(session)}
            loginRedirectTo={loginRedirectTo}
          />
          <ReportSheet
            placeId={place.id}
            isAuthenticated={Boolean(session)}
            loginRedirectTo={loginRedirectTo}
          />
        </div>

        <Separator />

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ContributorAvatar displayName={place.contributor?.displayName ?? "Community"} />
          {place.contributor ? (
            <span>
              Added by{" "}
              <Link href={`/u/${place.contributor.username}`} className="hover:text-foreground hover:underline">
                @{place.contributor.username}
              </Link>
              .
            </span>
          ) : (
            <span>Added by the community.</span>
          )}
        </div>
      </div>
    </div>
  );
}
