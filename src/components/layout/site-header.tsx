import Image from "next/image";
import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2">
          <Image src="/brand/logo.png" alt="" width={32} height={32} className="h-8 w-8" priority />
          <span className="text-lg font-semibold tracking-tight">AasPaas</span>
        </Link>
        <nav className="flex items-center gap-1 text-sm text-muted-foreground">
          <span className="hidden sm:inline">Discover what&rsquo;s around you</span>
        </nav>
      </div>
    </header>
  );
}
