import { NextResponse, type NextRequest } from "next/server";
import { ObjectId } from "mongodb";
import { getRefreshTokensCollection } from "@/lib/db/models/refreshToken";
import { getUsersCollection } from "@/lib/db/models/user";
import { signAccessToken } from "@/lib/auth/jwt";
import { generateOpaqueToken, hashOpaqueToken } from "@/lib/auth/tokens";
import {
  REFRESH_COOKIE,
  REFRESH_TOKEN_TTL_DAYS,
  setAuthCookies,
  clearAuthCookies,
} from "@/lib/auth/session";

/** Rotate-on-use: every refresh consumes the old token and issues a new one,
 * so a stolen-but-unused refresh token becomes invalid the next time the
 * legitimate client refreshes — see roadmap §2's auth row. */
export async function POST(request: NextRequest) {
  const rawToken = request.cookies.get(REFRESH_COOKIE)?.value;
  if (!rawToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const refreshTokens = await getRefreshTokensCollection();
  const now = new Date();
  const tokenDoc = await refreshTokens.findOne({
    tokenHash: hashOpaqueToken(rawToken),
    revoked: false,
    expiresAt: { $gt: now },
  });

  if (!tokenDoc) {
    const response = NextResponse.json({ error: "Session expired" }, { status: 401 });
    clearAuthCookies(response);
    return response;
  }

  const users = await getUsersCollection();
  const user = await users.findOne({ _id: tokenDoc.userId });
  if (!user || user.accountStatus !== "active") {
    await refreshTokens.updateOne({ _id: tokenDoc._id }, { $set: { revoked: true } });
    const response = NextResponse.json({ error: "Account unavailable" }, { status: 401 });
    clearAuthCookies(response);
    return response;
  }

  await refreshTokens.updateOne({ _id: tokenDoc._id }, { $set: { revoked: true } });

  const newRawToken = generateOpaqueToken();
  await refreshTokens.insertOne({
    _id: new ObjectId(),
    userId: user._id,
    tokenHash: hashOpaqueToken(newRawToken),
    issuedAt: now,
    expiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000),
    revoked: false,
    userAgent: request.headers.get("user-agent") ?? undefined,
  });

  const accessToken = await signAccessToken({
    sub: user._id.toHexString(),
    username: user.username,
    roles: user.roles,
    emailVerified: user.emailVerified,
  });

  const response = NextResponse.json({ message: "ok" });
  setAuthCookies(response, { accessToken, refreshToken: newRawToken });
  return response;
}
