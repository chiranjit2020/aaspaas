import bcrypt from "bcryptjs";

/**
 * bcrypt cost 12, per 07-roadmap-and-architecture.md §2's auth row.
 *
 * Using `bcryptjs` (pure JS) rather than the native `bcrypt` binding — same
 * algorithm, same cost factor, but no node-gyp/native build step, which
 * matters on Vercel's serverless functions and keeps local setup painless.
 */
const BCRYPT_COST = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
