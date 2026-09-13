import { getPlacesCollection } from "@/lib/db/models/place";

/**
 * "Local Pulse" — one featured locality's real, recent activity. Same
 * 30-day-window honesty rule as getDiscoverySurface.ts.
 *
 * Deliberately does NOT show "N useful contributions" or "N newly verified
 * places" from review2.md's mockup: useful-vote and verification EVENTS
 * aren't logged with timestamps anywhere (usefulCount/verificationCount are
 * running totals, not time series — there's no useful_votes collection at
 * all yet, voting is M4). Reporting a "this month" delta for something with
 * no time dimension would mean inventing it. The only thing we can honestly
 * compute a real delta for is new places, so that's the whole metric.
 *
 * Returns null (render nothing) if the most active locality still had zero
 * new places in the window — an honest quiet state beats a hollow "0 new
 * places" banner.
 */

const WINDOW_DAYS = 30;

export interface LocalPulse {
  locality: string;
  district: string;
  newCount: number;
  totalCount: number;
}

interface LocalPulseRow {
  _id: string;
  district: string;
  totalCount: number;
  newCount: number;
}

export async function getLocalPulse(): Promise<LocalPulse | null> {
  const places = await getPlacesCollection();
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const rows = await places
    .aggregate<LocalPulseRow>([
      { $match: { status: "published" } },
      {
        $group: {
          _id: "$locality",
          district: { $first: "$district" },
          totalCount: { $sum: 1 },
          newCount: { $sum: { $cond: [{ $gte: ["$createdAt", since] }, 1, 0] } },
        },
      },
      { $sort: { newCount: -1, totalCount: -1 } },
      { $limit: 1 },
    ])
    .toArray();

  const top = rows[0];
  if (!top || top.newCount === 0) return null;

  return { locality: top._id, district: top.district, newCount: top.newCount, totalCount: top.totalCount };
}
