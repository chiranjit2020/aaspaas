import Link from "next/link";
import { Sparkles } from "lucide-react";
import { CategoryIcon } from "@/components/places/category-icon";
import type { DiscoveryCategory } from "@/lib/discovery/getDiscoverySurface";

/**
 * "Around AasPaas" — real category activity, not a feed. Only rendered by
 * the caller when there's at least one category with genuine recent
 * activity (see getDiscoverySurface.ts) — no padding with zero-count cards.
 */
export function DiscoverySurface({ categories }: { categories: DiscoveryCategory[] }) {
  if (categories.length === 0) return null;

  return (
    <section aria-labelledby="discovery-surface-heading">
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className="size-4 text-primary" />
        <h2 id="discovery-surface-heading" className="font-heading text-lg font-semibold">
          Around AasPaas
        </h2>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">New this month, by category</p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {categories.map((cat) => (
          <Link
            key={cat.id}
            href={`/?category=${cat.slug}`}
            className="flex flex-col items-center gap-2 rounded-xl border border-border/60 px-3 py-4 text-center transition-colors hover:border-primary/50 hover:bg-accent/40"
          >
            <CategoryIcon name={cat.icon} className="size-5 text-primary" />
            <span className="text-sm font-medium">{cat.name}</span>
            <span className="text-xs font-medium text-warning">+{cat.newCount} new</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
