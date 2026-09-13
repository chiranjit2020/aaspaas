import Link from "next/link";
import { MapPin, Phone, ThumbsUp } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CategoryIcon } from "./category-icon";
import { ContributorAvatar } from "./contributor-avatar";
import type { PlaceSummary } from "@/types/domain";

export function PlaceCard({ place }: { place: PlaceSummary }) {
  return (
    // "Stretched link" pattern: the place link is an invisible full-card
    // overlay placed FIRST, so the real content (rendered after it) sits
    // visually on top per normal stacking order and its own links — the
    // contributor link below — remain independently clickable without
    // nesting an <a> inside an <a>.
    <Card className="relative h-full transition-colors hover:border-primary/50 hover:bg-accent/40">
      <Link href={`/places/${place.slug}`} className="absolute inset-0" aria-label={place.name} />
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
        <div>
          <h3 className="font-semibold leading-snug">{place.name}</h3>
          <Badge variant="secondary" className="mt-1.5 gap-1 font-normal">
            <CategoryIcon name={place.category.icon} className="size-3.5" />
            {place.category.name}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-sm text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <MapPin className="size-3.5 shrink-0 text-location" />
          <span>
            {place.locality} &middot; {place.pincode}
          </span>
        </div>
        <div className="flex items-center justify-between">
          {place.phone ? (
            <span className="flex items-center gap-1.5">
              <Phone className="size-3.5 shrink-0" />
              {place.phone}
            </span>
          ) : (
            <span />
          )}
          {place.usefulCount > 0 && (
            <span className="flex items-center gap-1 text-xs text-appreciation">
              <ThumbsUp className="size-3.5" />
              {place.usefulCount}
            </span>
          )}
        </div>
        {/* relative: without it, this static-flow row sits BELOW the
            absolutely-positioned stretched link above regardless of DOM
            order (position beats document order in stacking), so the
            contributor link would never actually receive clicks. */}
        <div className="relative flex items-center gap-1.5 pt-0.5 text-xs text-muted-foreground/80">
          <ContributorAvatar displayName={place.contributor?.displayName ?? "Community"} />
          {place.contributor ? (
            <Link href={`/u/${place.contributor.username}`} className="hover:text-foreground hover:underline">
              Added by @{place.contributor.username}
            </Link>
          ) : (
            <span>Added by the community</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
