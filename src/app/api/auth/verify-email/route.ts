import { NextResponse, type NextRequest } from "next/server";
import { verifyEmailSchema } from "@/lib/validation/auth";
import { verifyEmailToken } from "@/lib/auth/verifyEmailToken";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = verifyEmailSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid token" }, { status: 400 });
  }

  const result = await verifyEmailToken(parsed.data.token);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ message: "Email verified. You can now log in." });
}
