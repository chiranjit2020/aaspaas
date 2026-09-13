import { getEmailVerificationTokensCollection } from "@/lib/db/models/emailVerificationToken";
import { getUsersCollection } from "@/lib/db/models/user";
import { hashOpaqueToken } from "./tokens";

export type VerifyEmailResult = { ok: true } | { ok: false; error: string };

/**
 * Shared by POST /api/auth/verify-email (for programmatic/JS callers) and the
 * /verify-email page (a server component that calls this directly rather
 * than fetching its own API route).
 */
export async function verifyEmailToken(rawToken: string): Promise<VerifyEmailResult> {
  const tokenHash = hashOpaqueToken(rawToken);
  const tokens = await getEmailVerificationTokensCollection();
  const now = new Date();

  const tokenDoc = await tokens.findOne({
    tokenHash,
    usedAt: { $exists: false },
    expiresAt: { $gt: now },
  });

  if (!tokenDoc) {
    return { ok: false, error: "This verification link is invalid or has expired." };
  }

  const users = await getUsersCollection();
  await Promise.all([
    users.updateOne({ _id: tokenDoc.userId }, { $set: { emailVerified: true, updatedAt: now } }),
    tokens.updateOne({ _id: tokenDoc._id }, { $set: { usedAt: now } }),
  ]);

  return { ok: true };
}
