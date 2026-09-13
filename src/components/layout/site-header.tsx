import Image from "next/image";
import Link from "next/link";

// Wordmark only — no monogram/pin icon in the header, per brand direction.
// logo-text.png already carries the "Discover what's around you" tagline as
// its second line, so there's no separate tagline element here.
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="flex items-center">
          <Image
            src="/brand/logo-text.png"
            alt="AasPaas — Discover what's around you"
            width={809}
            height={237}
            className="h-10 w-auto"
            priority
          />
        </Link>
      </div>
    </header>
  );
}
