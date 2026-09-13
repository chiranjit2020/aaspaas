import type { Collection } from "mongodb";
import { getDb } from "@/lib/db/connect";
import type { ReportDoc } from "@/types/domain";

export const REPORTS_COLLECTION = "reports";

export async function getReportsCollection(): Promise<Collection<ReportDoc>> {
  const db = await getDb();
  return db.collection<ReportDoc>(REPORTS_COLLECTION);
}
