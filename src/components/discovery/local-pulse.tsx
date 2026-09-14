import Link from "next/link";
import { ArrowRight, Radio } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { LocalPulse as LocalPulseData } from "@/lib/discovery/getLocalPulse";

/**
 * One featured locality's real activity — not a feed, not a leaderboard.
 * Only rendered when the caller found real recent activity (see
 * getLocalPulse.ts); a locality with zero new places this month doesn't get
 * a hollow "0 new places" card.
 */
export function LocalPulse({ pulse }: { pulse: LocalPulseData }) {
  return (
    <Card className="border-primary/20 bg-primary/5 transition-shadow duration-200 hover:shadow-md hover:shadow-primary/10">
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-1.5 flex items-center gap-2 text-primary">
            <Radio className="size-4" />
            <span className="text-xs font-semibold tracking-wide uppercase">Local Pulse</span>
          </div>
          <p className="font-heading text-lg font-semibold">
            {pulse.locality} is on the move
          </p>
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-warning">+{pulse.newCount}</span> new place
            {pulse.newCount === 1 ? "" : "s"} this month &middot; {pulse.totalCount} mapped so far
          </p>
        </div>
        <Link
          href={`/?q=${encodeURIComponent(pulse.locality)}`}
          className="group flex shrink-0 items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          Explore {pulse.locality}
          <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-1" />
        </Link>
      </CardContent>
    </Card>
  );
}
