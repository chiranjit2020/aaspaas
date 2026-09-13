import { randomBytes, createHash } from "node:crypto";

/**
 * Opaque bearer tokens — used for refresh tokens and email-verification
 * tokens, per 07-roadmap-and-architecture.md §2: "32-byte random, hashed at
 * rest". The raw token goes to the client (cookie or email link); only its
 * hash is ever stored, so a DB read alone can't be replayed as a credential.
 *
 * These are deliberately NOT JWTs: a JWT's whole point is stateless
 * verification, but §1.3's schema stores {tokenHash, expiresAt, revoked} for
 * exactly these tokens specifically so they *can* be revoked — a capability a
 * bare JWT signature doesn't give you.
 */

export function generateOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashOpaqueToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
