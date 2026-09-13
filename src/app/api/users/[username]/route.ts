import { NextResponse } from "next/server";
import { getPublicProfile } from "@/lib/users/getPublicProfile";

/** GET /api/users/[username] — public contributor profile. No auth needed. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ username: string }> },
) {
  const { username } = await params;
  const result = await getPublicProfile(username);

  if (!result) {
    return NextResponse.json({ error: "Contributor not found" }, { status: 404 });
  }

  return NextResponse.json(result.profile);
}
