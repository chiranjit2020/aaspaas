import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { assertModerator } from "@/lib/auth/requireModerator";
import { getModerationQueue } from "@/lib/moderation/getModerationQueue";

/** GET /api/moderation/queue — pending places awaiting review. */
export async function GET(request: NextRequest) {
  const session = await getCurrentUser(request);
  const check = await assertModerator(session);
  if (!check.ok) {
    return NextResponse.json({ error: check.error }, { status: check.status });
  }

  const items = await getModerationQueue();
  return NextResponse.json({ items });
}
