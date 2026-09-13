import { NextResponse } from "next/server";
import { getCategoriesCollection } from "@/lib/db/models/category";
import { toCategorySummary } from "@/lib/db/serialize";

export async function GET() {
  const categories = await getCategoriesCollection();
  const docs = await categories.find({}).sort({ name: 1 }).toArray();
  return NextResponse.json({ items: docs.map(toCategorySummary) });
}
