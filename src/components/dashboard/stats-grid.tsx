import { MapPin, Pencil, Flag, ThumbsUp, XCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { UserProfile } from "@/types/domain";

/**
 * Plain stat tiles — no delta/trend/color-by-severity. This is a private,
 * honest record of what happened, not a dashboard trying to make a number
 * feel good; every tile gets the same neutral treatment (one design-system
 * rule this app already holds elsewhere: a card gets a neutral base plus at
 * most one accent, never five different hues across five tiles).
 */
const TILES: {
  key: keyof UserProfile["stats"];
  label: string;
  icon: typeof MapPin;
}[] = [
  { key: "placesAdded", label: "Places added", icon: MapPin },
  { key: "correctionsMade", label: "Corrections made", icon: Pencil },
  { key: "reportsFiled", label: "Reports filed", icon: Flag },
  { key: "usefulVotesReceived", label: "Useful votes received", icon: ThumbsUp },
  { key: "rejectedSubmissions", label: "Rejected submissions", icon: XCircle },
];

export function StatsGrid({ stats }: { stats: UserProfile["stats"] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {TILES.map(({ key, label, icon: Icon }) => (
        <Card key={key} className="gap-2 py-4">
          <CardContent className="flex flex-col gap-1.5 px-4">
            <Icon className="size-4 text-muted-foreground" />
            <p className="text-2xl font-semibold">{stats[key]}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
