import { searchPlaces } from "@/lib/search/service";
import { getCategoriesCollection } from "@/lib/db/models/category";
import { toCategorySummary } from "@/lib/db/serialize";
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

  const [categoriesCol, initialResults] = await Promise.all([
    getCategoriesCollection(),
    searchPlaces({ q, categorySlug: category }),
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
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Discover what&rsquo;s around you
        </h1>
        <p className="max-w-xl text-muted-foreground">
          A local directory built by the community &mdash; shops, restaurants, repair
          services and more, added and verified by the people who actually use them.
        </p>
      </div>

      <SearchExperience
        initialQuery={q}
        initialCategorySlug={category}
        initialResults={initialResults.items}
        initialNextCursor={initialResults.nextCursor}
        topCategories={topCategories}
      />
    </div>
  );
}
