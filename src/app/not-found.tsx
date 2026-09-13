import Link from "next/link";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Without this file, Next.js falls back to its generic built-in not-found
 * UI, which doesn't respect our theme (renders on a plain white background
 * regardless of dark mode) — found while verifying Phase 4's new
 * /u/[username] 404 case, but it affects every notFound() call in the app
 * (place detail, profile), not just this one.
 */
export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <Compass className="size-10 text-muted-foreground" />
      <h1 className="font-heading text-2xl font-bold">Nothing here</h1>
      <p className="text-muted-foreground">
        This page, place or contributor doesn&rsquo;t exist &mdash; or hasn&rsquo;t been
        added yet.
      </p>
      <Button asChild>
        <Link href="/">Back to search</Link>
      </Button>
    </div>
  );
}
