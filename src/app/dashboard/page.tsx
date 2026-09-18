import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ObjectId } from "mongodb";
import { getCurrentUserFromCookieStore } from "@/lib/auth/session";
import { getUsersCollection } from "@/lib/db/models/user";
import { getPlacesCollection } from "@/lib/db/models/place";
import { toUserProfile } from "@/lib/db/serialize";
import { REPUTATION_LEVEL_LABELS } from "@/lib/trust/reputationLabels";
import { ContributorAvatar } from "@/components/places/contributor-avatar";
import { SubmissionsList } from "@/components/dashboard/submissions-list";
import { StatsGrid } from "@/components/dashboard/stats-grid";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

export const metadata: Metadata = { title: "Your dashboard — AasPaas" };

const DATE_FORMAT = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" });

export default async function DashboardPage() {
  const session = await getCurrentUserFromCookieStore();
  if (!session) {
    redirect("/login?next=/dashboard");
  }

  const [users, places] = await Promise.all([getUsersCollection(), getPlacesCollection()]);

  const userDoc = await users.findOne({ _id: new ObjectId(session.sub) });
  if (!userDoc) {
    redirect("/login?next=/dashboard");
  }
  const profile = toUserProfile(userDoc);

  const mySubmissions = await places
    .find(
      { createdBy: userDoc._id },
      { projection: { name: 1, status: 1, locality: 1, district: 1, createdAt: 1 } },
    )
    .sort({ createdAt: -1 })
    .limit(10)
    .toArray();

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="flex items-center gap-3">
        <ContributorAvatar displayName={profile.displayName} size="lg" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{profile.displayName}</h1>
          <p className="text-sm text-muted-foreground">
            @{profile.username} &middot; Member since {DATE_FORMAT.format(new Date(profile.createdAt))}
          </p>
        </div>
        <Badge variant="secondary" className="ml-auto font-normal">
          {REPUTATION_LEVEL_LABELS[profile.reputationLevel]}
        </Badge>
      </div>

      <Separator className="my-6" />

      <h2 className="mb-4 text-lg font-semibold">Your stats</h2>
      <StatsGrid stats={profile.stats} />

      <Separator className="my-6" />

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Recent submissions</h2>
        <Button asChild variant="ghost" size="sm">
          <Link href="/add-place">Add a place</Link>
        </Button>
      </div>
      <SubmissionsList places={mySubmissions} />

      <Separator className="my-6" />

      <Link
        href={`/u/${profile.username}`}
        className="text-sm text-muted-foreground hover:text-foreground hover:underline"
      >
        View public profile &rarr;
      </Link>
    </div>
  );
}
