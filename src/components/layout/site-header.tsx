import Image from "next/image";
import Link from "next/link";
import { Plus, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LogoutButton } from "@/components/auth/logout-button";
import { MobileNav } from "@/components/layout/mobile-nav";
import { getCurrentUserFromCookieStore } from "@/lib/auth/session";

// Wordmark only — no monogram/pin icon in the header, per brand direction.
// logo-text.png already carries the "Discover what's around you" tagline as
// its second line, so there's no separate tagline element here.
export async function SiteHeader() {
  const session = await getCurrentUserFromCookieStore();
  // UI convenience only, from the JWT's roles claim — not a security
  // boundary. /moderation itself re-checks the role fresh from the DB (see
  // requireModerator.ts), so a stale claim here at worst shows a link that
  // 404s, never grants access.
  const isModerator = session?.roles.some((r) => r === "MODERATOR" || r === "ADMIN");

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="flex items-center">
          <Image
            src="/brand/logo-text.png"
            alt="AasPaas — Discover what's around you"
            width={809}
            height={237}
            // ~38% of the mobile header width — h-8 (~30%) read as shrunk
            // too far; h-[38px] up to the sm breakpoint, back to the
            // original h-10 once there's room to spare.
            className="h-[38px] w-auto sm:h-10"
            priority
          />
        </Link>

        {/* Full inline row from sm up — collapses behind MobileNav's
            hamburger below that, rather than cramming every CTA into a
            phone-width header. */}
        <nav className="hidden items-center gap-2 sm:flex">
          {/* Always visible, logged in or not — /add-place itself redirects
              a logged-out visitor to /login?next=/add-place, so this is a
              real entry point for someone who hasn't signed up yet, not just
              a shortcut for existing contributors. */}
          <Button asChild variant="ghost" size="sm">
            <Link href="/add-place">
              <Plus />
              Add Place
            </Link>
          </Button>
          {session ? (
            <>
              {isModerator && (
                <Button asChild variant="ghost" size="sm">
                  <Link href="/moderation">
                    <ShieldCheck />
                    Moderate
                  </Link>
                </Button>
              )}
              <Link
                href={`/u/${session.username}`}
                className="hidden text-sm text-muted-foreground hover:text-foreground sm:inline"
              >
                @{session.username}
              </Link>
              <LogoutButton />
            </>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link href="/login">Log in</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/register">Sign up</Link>
              </Button>
            </>
          )}
        </nav>

        {/* Kept outside the hamburger sheet on mobile too — the whole point
            of an always-visible Add Place CTA is that it doesn't cost an
            extra tap through a menu to reach. */}
        <div className="flex items-center gap-1 sm:hidden">
          <Button asChild variant="ghost" size="sm">
            <Link href="/add-place">
              <Plus />
              Add place
            </Link>
          </Button>
          <MobileNav
            isLoggedIn={Boolean(session)}
            username={session?.username}
            isModerator={Boolean(isModerator)}
          />
        </div>
      </div>
    </header>
  );
}
