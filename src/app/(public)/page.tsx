import { searchPlaces } from "@/lib/search/service";
import { getCategoriesCollection } from "@/lib/db/models/category";
import { toCategorySummary } from "@/lib/db/serialize";
import { getDiscoverySurface } from "@/lib/discovery/getDiscoverySurface";
import { getLocalPulse } from "@/lib/discovery/getLocalPulse";
import { SearchExperience } from "@/components/search/search-experience";

interface HomePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const sp = await searchParams;
  const q = firstValue(sp.q) ?? "";
  const category = firstValue(sp.category);

  // Discovery Surface / Local Pulse only ever render in browse mode (see
  // SearchExperience's isBrowsing) — skip the extra aggregations entirely
  // when the page loads with an active search or filter already, e.g. a
  // shared /?q=... link.
  const isBrowsing = !q && !category;

  const [categoriesCol, initialResults, discoveryCategories, localPulse] = await Promise.all([
    getCategoriesCollection(),
    searchPlaces({ q, categorySlug: category }),
    isBrowsing ? getDiscoverySurface() : Promise.resolve([]),
    isBrowsing ? getLocalPulse() : Promise.resolve(null),
  ]);

  const categoryDocs = await categoriesCol.find({ parentCategoryId: null }).sort({ name: 1 }).toArray();
  const topCategories = categoryDocs.map(toCategorySummary);

  return (
    <div className="relative mx-auto max-w-6xl px-4 py-10 sm:py-14">
      <div
        aria-hidden
        className="bg-hero-grid pointer-events-none absolute inset-x-0 top-0 -z-10 h-[420px] sm:h-[480px]"
      />

      <div className="mb-10 flex flex-col items-center gap-4 text-center">
        {/* Two short sentences now, not one five-word phrase — long enough
            that forcing it onto a single mobile line (the old clamp()/
            nowrap treatment) would mean an unreadably tiny font. Normal
            wrapping is the right call at this length. */}
        <h1 className="animate-blur-fade-up text-3xl font-bold tracking-tight sm:text-4xl">
          <em>Discover</em> what&rsquo;s around you. <em>Add</em> what&rsquo;s <em>missing</em>.
        </h1>
        <p className="animate-blur-fade-up max-w-xl text-muted-foreground [animation-delay:150ms]">
          Find local shops, restaurants, services and more &mdash; or add a place
          to help your neighbourhood grow.
        </p>
      </div>

      <div className="animate-blur-fade-up [animation-delay:280ms]">
        <SearchExperience
          initialQuery={q}
          initialCategorySlug={category}
          initialResults={initialResults.items}
          initialNextCursor={initialResults.nextCursor}
          topCategories={topCategories}
          discoveryCategories={discoveryCategories}
          localPulse={localPulse}
        />
      </div>
    </div>
  );
}
