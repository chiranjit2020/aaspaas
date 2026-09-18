"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, LocateFixed, List, Map as MapIcon, X } from "lucide-react";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PlaceCard } from "@/components/places/place-card";
import { CategoryIcon } from "@/components/places/category-icon";
import { DiscoverySurface } from "@/components/discovery/discovery-surface";
import { LocalPulse } from "@/components/discovery/local-pulse";
import { ResultsMap } from "@/components/map/results-map";
import { useGeolocation } from "@/hooks/use-geolocation";
import type { CategorySummary } from "@/lib/db/serialize";
import type { PlaceSummary } from "@/types/domain";
import type { DiscoveryCategory } from "@/lib/discovery/getDiscoverySurface";
import type { LocalPulse as LocalPulseData } from "@/lib/discovery/getLocalPulse";

interface SearchExperienceProps {
  initialQuery: string;
  initialCategorySlug?: string;
  initialResults: PlaceSummary[];
  initialNextCursor: string | null;
  /** Only top-level categories are shown as quick filters, per the M1 IA. */
  topCategories: CategorySummary[];
  /** Browse-mode-only surfaces — hidden once the user searches or filters. */
  discoveryCategories: DiscoveryCategory[];
  localPulse: LocalPulseData | null;
}

interface SearchResponse {
  items: PlaceSummary[];
  nextCursor: string | null;
}

/** Radius presets for near-me search — errand-scale, not whole-district (see buildQuery.ts's MAX_RADIUS_KM). */
const RADIUS_PRESETS_KM = [2, 5, 10, 25];
const DEFAULT_RADIUS_KM = 5;

interface GeoSearchParams {
  lat: number;
  lng: number;
  radiusKm: number;
}

async function fetchResults(
  q: string,
  category: string | undefined,
  cursor?: string,
  geo?: GeoSearchParams,
): Promise<SearchResponse> {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (category) params.set("category", category);
  if (cursor) params.set("cursor", cursor);
  if (geo) {
    params.set("lat", String(geo.lat));
    params.set("lng", String(geo.lng));
    params.set("radiusKm", String(geo.radiusKm));
  }
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
  discoveryCategories,
  localPulse,
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

  const [viewMode, setViewMode] = useState<"list" | "map">("list");
  const [radiusKm, setRadiusKm] = useState(DEFAULT_RADIUS_KM);
  const geo = useGeolocation();
  const nearMe = Boolean(geo.coords);

  const isFirstRun = useRef(true);
  // Discovery Surface / Local Pulse are browse aids ("something to browse
  // even when they aren't searching" — review2.md) -- once there's an active
  // query, category filter, or near-me search, the person is looking for
  // something specific, so give the results grid the full attention instead.
  const isBrowsing = !query.trim() && !activeCategory && !nearMe;

  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }

    const geoParams: GeoSearchParams | undefined = geo.coords
      ? { lat: geo.coords.lat, lng: geo.coords.lng, radiusKm }
      : undefined;

    const handle = setTimeout(() => {
      setLoading(true);
      setError(null);
      fetchResults(query, activeCategory, undefined, geoParams)
        .then((data) => {
          setResults(data.items);
          setNextCursor(data.nextCursor);
        })
        .catch(() => setError("Couldn't load results. Try again."))
        .finally(() => setLoading(false));

      // Deliberately don't put lat/lng/radiusKm in the URL the way q/category
      // are synced — the *place's* coordinates are public product data as of
      // Phase 4, but the *searcher's* precise location landing in a
      // shareable/bookmarkable URL would be a real privacy leak this phase
      // doesn't sign up for. Near-me stays ephemeral client state only.
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
  }, [query, activeCategory, geo.coords, radiusKm]);

  async function handleLoadMore() {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const geoParams: GeoSearchParams | undefined = geo.coords
        ? { lat: geo.coords.lat, lng: geo.coords.lng, radiusKm }
        : undefined;
      const data = await fetchResults(query, activeCategory, nextCursor, geoParams);
      setResults((prev) => [...prev, ...data.items]);
      setNextCursor(data.nextCursor);
    } catch {
      setError("Couldn't load more results. Try again.");
    } finally {
      setLoadingMore(false);
    }
  }

  function toggleNearMe() {
    if (nearMe) {
      geo.reset();
    } else {
      geo.locate();
    }
  }

  return (
    <div className="space-y-6">
      <InputGroup className="h-12 border-transparent bg-card/60 ring-4 ring-foreground/15 backdrop-blur-md has-[[data-slot=input-group-control]:focus-visible]:border-transparent has-[[data-slot=input-group-control]:focus-visible]:ring-4 has-[[data-slot=input-group-control]:focus-visible]:ring-foreground/30">
        <InputGroupAddon>
          <Search className="text-warning" />
        </InputGroupAddon>
        <InputGroupInput
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search a place, category, locality or PIN&hellip;"
          className="text-base placeholder:text-sm"
          aria-label="Search places"
        />
        <InputGroupAddon align="inline-end">
          <div className="flex size-4 items-center justify-center">
            {loading && <Spinner />}
          </div>
        </InputGroupAddon>
      </InputGroup>

      <div className="flex flex-wrap items-center gap-2">
        {topCategories.map((cat) => {
          const active = activeCategory === cat.slug;
          return (
            <Badge
              key={cat.id}
              variant={active ? "default" : "outline"}
              className="cursor-pointer gap-1.5 px-3 py-1.5 text-sm font-normal duration-150 hover:scale-105 active:scale-95"
              onClick={() => setActiveCategory(active ? undefined : cat.slug)}
            >
              <CategoryIcon name={cat.icon} className="size-3.5" />
              {cat.name}
            </Badge>
          );
        })}

        <span className="mx-1 h-5 w-px bg-border" aria-hidden />

        <Button
          type="button"
          variant={nearMe ? "default" : "outline"}
          size="sm"
          className="gap-1.5"
          onClick={toggleNearMe}
          disabled={geo.locating}
          aria-pressed={nearMe}
        >
          {geo.locating ? <Spinner /> : <LocateFixed className="size-3.5" />}
          Near me
        </Button>

        <div className="ml-auto flex items-center gap-1 rounded-lg border border-border p-0.5">
          <Button
            type="button"
            variant={viewMode === "list" ? "secondary" : "ghost"}
            size="icon-sm"
            aria-pressed={viewMode === "list"}
            aria-label="List view"
            onClick={() => setViewMode("list")}
          >
            <List className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant={viewMode === "map" ? "secondary" : "ghost"}
            size="icon-sm"
            aria-pressed={viewMode === "map"}
            aria-label="Map view"
            onClick={() => setViewMode("map")}
          >
            <MapIcon className="size-3.5" />
          </Button>
        </div>
      </div>

      {geo.error && (
        <p className="flex items-center gap-1.5 text-sm text-destructive">
          {geo.error.message}
          <button type="button" onClick={geo.reset} className="text-muted-foreground hover:text-foreground">
            <X className="size-3.5" />
          </button>
        </p>
      )}

      {nearMe && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>Within</span>
          {RADIUS_PRESETS_KM.map((km) => (
            <Badge
              key={km}
              variant={radiusKm === km ? "default" : "outline"}
              className="cursor-pointer px-2.5 py-1 font-normal"
              onClick={() => setRadiusKm(km)}
            >
              {km} km
            </Badge>
          ))}
        </div>
      )}

      {isBrowsing && (localPulse || discoveryCategories.length > 0) && (
        <div className="space-y-6">
          {localPulse && <LocalPulse pulse={localPulse} />}
          <DiscoverySurface categories={discoveryCategories} />
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      ) : results.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground italic sm:text-base">
          No places found yet. Try a different search &mdash; or be the first to add one.
        </p>
      ) : viewMode === "map" ? (
        <ResultsMap places={results} userCoords={geo.coords} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((place, i) => (
            // Staggered per-card reveal instead of the whole grid appearing
            // at once — capped at the first 8 so a 30-result page doesn't
            // end with a visibly-lagging last row. Keyed on place.id so
            // React remounts (and thus re-plays the animation) exactly when
            // the actual result set changes, e.g. a new search.
            <div
              key={place.id}
              className="animate-fade-up"
              style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
            >
              <PlaceCard place={place} />
            </div>
          ))}
        </div>
      )}

      {nextCursor && !loading && (
        <div className="flex justify-center pt-2">
          <Button variant="outline" onClick={handleLoadMore} disabled={loadingMore}>
            {loadingMore && <Spinner />}
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}

