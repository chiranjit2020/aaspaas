import { NextResponse, type NextRequest } from "next/server";
import { getRefreshTokensCollection } from "@/lib/db/models/refreshToken";
import { hashOpaqueToken } from "@/lib/auth/tokens";
import { REFRESH_COOKIE, clearAuthCookies } from "@/lib/auth/session";

export async function POST(request: NextRequest) {
  const rawToken = request.cookies.get(REFRESH_COOKIE)?.value;
  if (rawToken) {
    const refreshTokens = await getRefreshTokensCollection();
    await refreshTokens.updateOne(
      { tokenHash: hashOpaqueToken(rawToken) },
      { $set: { revoked: true } },
    );
  }

  const response = NextResponse.json({ message: "Logged out" });
  clearAuthCookies(response);
  return response;
}
