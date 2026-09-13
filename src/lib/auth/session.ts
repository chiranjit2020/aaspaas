import type { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyAccessToken, type AccessTokenPayload } from "./jwt";

/**
 * Cookie contract, per §2: access JWT (15 min) in an httpOnly Secure
 * SameSite=Lax cookie; refresh token (7–30 days — we use 30), rotated on use.
 * The refresh cookie is scoped to /api/auth so it's only ever sent to the
 * routes that need it, shrinking the blast radius if it ever leaked via some
 * other endpoint's logs.
 */

export const ACCESS_COOKIE = "aaspaas_access";
export const REFRESH_COOKIE = "aaspaas_refresh";
export const REFRESH_TOKEN_TTL_DAYS = 30;

const isProd = process.env.NODE_ENV === "production";

export function accessCookieOptions() {
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 15 * 60, // seconds, matches ACCESS_TOKEN_TTL_SECONDS
  };
}

export function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax" as const,
    path: "/api/auth",
    maxAge: REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60,
  };
}

export function setAuthCookies(
  response: NextResponse,
  tokens: { accessToken: string; refreshToken: string },
): void {
  response.cookies.set(ACCESS_COOKIE, tokens.accessToken, accessCookieOptions());
  response.cookies.set(REFRESH_COOKIE, tokens.refreshToken, refreshCookieOptions());
}

export function clearAuthCookies(response: NextResponse): void {
  response.cookies.set(ACCESS_COOKIE, "", { ...accessCookieOptions(), maxAge: 0 });
  response.cookies.set(REFRESH_COOKIE, "", { ...refreshCookieOptions(), maxAge: 0 });
}

/** For API route handlers, which get a NextRequest. */
export async function getCurrentUser(request: NextRequest): Promise<AccessTokenPayload | null> {
  const token = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!token) return null;
  return verifyAccessToken(token);
}

/** For server components / layouts, which read cookies via next/headers. */
export async function getCurrentUserFromCookieStore(): Promise<AccessTokenPayload | null> {
  const store = await cookies();
  const token = store.get(ACCESS_COOKIE)?.value;
  if (!token) return null;
  return verifyAccessToken(token);
}
