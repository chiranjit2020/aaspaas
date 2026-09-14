import { NextResponse, type NextRequest } from "next/server";
import { ObjectId } from "mongodb";
import { getCurrentUser } from "@/lib/auth/session";
import { getPlacesCollection } from "@/lib/db/models/place";
import { getReportsCollection } from "@/lib/db/models/report";
import { getUsersCollection } from "@/lib/db/models/user";
import { reportInputSchema } from "@/lib/validation/report";
import { checkRateLimit } from "@/lib/rateLimit";
import { REPORT_DAILY_LIMIT, ONE_DAY_MS } from "@/lib/rateLimit/tiers";

/** POST /api/places/[id]/report — file a "report incorrect info" against a place. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getCurrentUser(request);
  if (!session) {
    return NextResponse.json({ error: "You must be logged in to file a report." }, { status: 401 });
  }

  const rate = await checkRateLimit({
    key: `report:${session.sub}`,
    limit: REPORT_DAILY_LIMIT,
    windowMs: ONE_DAY_MS,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: `Daily report limit reached (${REPORT_DAILY_LIMIT}/day). Try again tomorrow.` },
      { status: 429 },
    );
  }

  const { id } = await params;
  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid place id" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = reportInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const places = await getPlacesCollection();
  const place = await places.findOne({ _id: new ObjectId(id), status: "published" });
  if (!place) {
    return NextResponse.json({ error: "Place not found" }, { status: 404 });
  }

  const reports = await getReportsCollection();
  const now = new Date();
  const userId = new ObjectId(session.sub);
  const reportDoc = {
    _id: new ObjectId(),
    placeId: place._id,
    userId,
    reason: parsed.data.reason,
    details: parsed.data.details,
    status: "open" as const,
    createdAt: now,
  };
  await reports.insertOne(reportDoc);

  const users = await getUsersCollection();
  await users.updateOne({ _id: userId }, { $inc: { "stats.reportsFiled": 1 } });

  return NextResponse.json({ id: reportDoc._id.toHexString(), status: reportDoc.status }, { status: 201 });
}
