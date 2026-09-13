import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import type { UserRole } from "@/types/domain";

/**
 * Access JWT — 15 minutes, per §2. Short-lived and stateless: authorization
 * checks that matter (moderation, ownership) still re-read from the DB where
 * the roadmap calls for it; this token is for "is there a session at all."
 *
 * Uses `jose` rather than `jsonwebtoken`: it's Edge-runtime compatible, which
 * matters if a future middleware.ts needs to check auth before a route even
 * loads.
 */

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

export interface AccessTokenPayload extends JWTPayload {
  sub: string; // userId
  username: string;
  roles: UserRole[];
  emailVerified: boolean;
}

function getSecretKey(): Uint8Array {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) {
    throw new Error("JWT_ACCESS_SECRET is not set. Copy .env.example to .env.local first.");
  }
  return new TextEncoder().encode(secret);
}

export async function signAccessToken(
  payload: Omit<AccessTokenPayload, "iat" | "exp">,
): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(getSecretKey());
}

export async function verifyAccessToken(token: string): Promise<AccessTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    return payload as AccessTokenPayload;
  } catch {
    return null;
  }
}
