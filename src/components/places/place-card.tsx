import Link from "next/link";
import { MapPin, Phone, ThumbsUp } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CategoryIcon } from "./category-icon";
import type { PlaceSummary } from "@/types/domain";

export function PlaceCard({ place }: { place: PlaceSummary }) {
  return (
    <Link href={`/places/${place.slug}`} className="block">
      <Card className="h-full transition-colors hover:border-primary/50 hover:bg-accent/40">
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
            <MapPin className="size-3.5 shrink-0" />
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
              <span className="flex items-center gap-1 text-xs text-success">
                <ThumbsUp className="size-3.5" />
                {place.usefulCount}
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
