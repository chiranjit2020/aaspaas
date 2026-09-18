import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ObjectId } from "mongodb";
import { getCurrentUserFromCookieStore } from "@/lib/auth/session";
import { getCategoriesCollection } from "@/lib/db/models/category";
import { getPlacesCollection } from "@/lib/db/models/place";
import { toCategorySummary } from "@/lib/db/serialize";
import { AddPlaceForm } from "@/components/places/add-place-form";
import { SubmissionsList } from "@/components/dashboard/submissions-list";
import { Separator } from "@/components/ui/separator";

export const metadata: Metadata = { title: "Add a place — AasPaas" };

export default async function AddPlacePage() {
  const session = await getCurrentUserFromCookieStore();
  if (!session) {
    redirect("/login?next=/add-place");
  }

  const [categoriesCol, places] = await Promise.all([
    getCategoriesCollection(),
    getPlacesCollection(),
  ]);

  const categoryDocs = await categoriesCol.find({}).sort({ name: 1 }).toArray();
  const parents = categoryDocs.filter((c) => !c.parentCategoryId);
  const categoryGroups = parents.map((parent) => ({
    parent: toCategorySummary(parent),
    children: categoryDocs
      .filter((c) => c.parentCategoryId?.equals(parent._id))
      .map(toCategorySummary),
  }));

  const mySubmissions = await places
    .find(
      { createdBy: new ObjectId(session.sub) },
      { projection: { name: 1, slug: 1, status: 1, locality: 1, district: 1, createdAt: 1 } },
    )
    .sort({ createdAt: -1 })
    .limit(50)
    .toArray();

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="mb-1 text-2xl font-bold tracking-tight sm:text-3xl">Add a place</h1>
      <p className="mb-8 text-muted-foreground">
        Know a shop, service or restaurant that isn&rsquo;t here yet? Add it for the
        community &mdash; a moderator reviews new places before they go live.
      </p>

      <AddPlaceForm categoryGroups={categoryGroups} />

      <Separator className="my-10" />

      <h2 className="mb-4 text-lg font-semibold">Your submissions</h2>
      <SubmissionsList places={mySubmissions} />
    </div>
  );
}
