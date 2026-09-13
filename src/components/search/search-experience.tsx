"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PlaceCard } from "@/components/places/place-card";
import { CategoryIcon } from "@/components/places/category-icon";
import type { CategorySummary } from "@/lib/db/serialize";
import type { PlaceSummary } from "@/types/domain";

interface SearchExperienceProps {
  initialQuery: string;
  initialCategorySlug?: string;
  initialResults: PlaceSummary[];
  initialNextCursor: string | null;
  /** Only top-level categories are shown as quick filters, per the M1 IA. */
  topCategories: CategorySummary[];
}

interface SearchResponse {
  items: PlaceSummary[];
  nextCursor: string | null;
}

async function fetchResults(
  q: string,
  category: string | undefined,
  cursor?: string,
): Promise<SearchResponse> {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (category) params.set("category", category);
  if (cursor) params.set("cursor", cursor);
  const res = await fetch(`/api/search?${params.toString()}`);
  if (!res.ok) throw new Error("Search request failed");
  return res.json();
}

const DEBOUNCE_MS = 300;

export function SearchExperience({
  initialQuery,
  initialCategorySlug,
  initialResults,
  initialNextCursor,
  topCategories,
}: SearchExperienceProps) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [activeCategory, setActiveCategory] = useState<string | undefined>(initialCategorySlug);
  const [results, setResults] = useState(initialResults);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const isFirstRun = useRef(true);

  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }

    const handle = setTimeout(() => {
      setLoading(true);
      setError(null);
      fetchResults(query, activeCategory)
        .then((data) => {
          setResults(data.items);
          setNextCursor(data.nextCursor);
        })
        .catch(() => setError("Couldn't load results. Try again."))
        .finally(() => setLoading(false));

      const params = new URLSearchParams();
      if (query) params.set("q", query);
      if (activeCategory) params.set("category", activeCategory);
      const qs = params.toString();
      startTransition(() => {
        router.replace(qs ? `/?${qs}` : "/", { scroll: false });
      });
    }, DEBOUNCE_MS);

    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, activeCategory]);

  async function handleLoadMore() {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const data = await fetchResults(query, activeCategory, nextCursor);
      setResults((prev) => [...prev, ...data.items]);
      setNextCursor(data.nextCursor);
    } catch {
      setError("Couldn't load more results. Try again.");
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-warning" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search a place, category, locality or PIN&hellip;"
          className="h-12 border-transparent bg-card/60 pl-9 text-base ring-4 ring-foreground/15 backdrop-blur-md placeholder:text-sm focus-visible:border-transparent focus-visible:ring-4 focus-visible:ring-foreground/30"
          aria-label="Search places"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {topCategories.map((cat) => {
          const active = activeCategory === cat.slug;
          return (
            <Badge
              key={cat.id}
              variant={active ? "default" : "outline"}
              className="cursor-pointer gap-1.5 px-3 py-1.5 text-sm font-normal"
              onClick={() => setActiveCategory(active ? undefined : cat.slug)}
            >
              <CategoryIcon name={cat.icon} className="size-3.5" />
              {cat.name}
            </Badge>
          );
        })}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      ) : results.length === 0 ? (
        <p className="py-12 text-center text-muted-foreground">
          No places found yet. Try a different search &mdash; or be the first to add one.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((place) => (
            <PlaceCard key={place.id} place={place} />
          ))}
        </div>
      )}

      {nextCursor && !loading && (
        <div className="flex justify-center pt-2">
          <Button variant="outline" onClick={handleLoadMore} disabled={loadingMore}>
            {loadingMore && <Loader2 className="size-4 animate-spin" />}
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}
