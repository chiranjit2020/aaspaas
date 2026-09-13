import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { getCurrentUserFromCookieStore } from "@/lib/auth/session";
import { assertModerator } from "@/lib/auth/requireModerator";
import { getModerationQueue } from "@/lib/moderation/getModerationQueue";
import { ModerationQueue } from "@/components/moderation/moderation-queue";

export const metadata: Metadata = { title: "Moderation queue — AasPaas" };

export default async function ModerationPage() {
  const session = await getCurrentUserFromCookieStore();
  if (!session) {
    redirect("/login?next=/moderation");
  }

  // Re-checked fresh from the DB, never trusted from the JWT alone — see
  // requireModerator.ts. A non-moderator gets a plain 404, not a "forbidden"
  // page, so the admin panel's existence isn't advertised to regular users.
  const check = await assertModerator(session);
  if (!check.ok) {
    notFound();
  }

  const queue = await getModerationQueue();

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="mb-8 text-2xl font-bold tracking-tight sm:text-3xl">
        Moderation queue
      </h1>
      <ModerationQueue initialQueue={queue} />
    </div>
  );
}
