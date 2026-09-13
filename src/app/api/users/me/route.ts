import { NextResponse, type NextRequest } from "next/server";
import { ObjectId } from "mongodb";
import { getCurrentUser } from "@/lib/auth/session";
import { getUsersCollection } from "@/lib/db/models/user";
import { toUserProfile } from "@/lib/db/serialize";

export async function GET(request: NextRequest) {
  const session = await getCurrentUser(request);
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const users = await getUsersCollection();
  const user = await users.findOne({ _id: new ObjectId(session.sub) });
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  return NextResponse.json(toUserProfile(user));
}
