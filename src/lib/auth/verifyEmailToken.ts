import { getEmailVerificationTokensCollection } from "@/lib/db/models/emailVerificationToken";
import { getUsersCollection } from "@/lib/db/models/user";
import { hashOpaqueToken } from "./tokens";

export type VerifyEmailResult = { ok: true } | { ok: false; error: string };

/**
 * Shared by POST /api/auth/verify-email (for programmatic/JS callers) and the
 * /verify-email page (a server component that calls this directly rather
 * than fetching its own API route).
 *
 * Idempotent by design: a verification link commonly gets hit more than once
 * before the actual person clicks it — email providers' spam/safety scanners
 * (Outlook Safe Links, Gmail's link checks, etc.) routinely pre-fetch links
 * in incoming mail to scan for phishing, which "uses" a naive single-use
 * token before the real click ever happens. That's especially likely for a
 * mail landing in spam in the first place. Rather than treat "already used"
 * as an error, check whether the account it belongs to is already verified
 * and say so — the person doesn't care *which* request did it.
 */
export async function verifyEmailToken(rawToken: string): Promise<VerifyEmailResult> {
  const tokenHash = hashOpaqueToken(rawToken);
  const tokens = await getEmailVerificationTokensCollection();
  const now = new Date();

  const tokenDoc = await tokens.findOne({ tokenHash });
  if (!tokenDoc) {
    return { ok: false, error: "This verification link is invalid." };
  }

  const users = await getUsersCollection();

  if (tokenDoc.usedAt) {
    const user = await users.findOne({ _id: tokenDoc.userId });
    if (user?.emailVerified) {
      return { ok: true };
    }
    // Used but the account somehow isn't verified — a real inconsistency,
    // not just a duplicate hit. Don't silently "fix" it here.
    return { ok: false, error: "This verification link has already been used." };
  }

  if (tokenDoc.expiresAt <= now) {
    return { ok: false, error: "This verification link has expired." };
  }

  await Promise.all([
    users.updateOne({ _id: tokenDoc.userId }, { $set: { emailVerified: true, updatedAt: now } }),
    tokens.updateOne({ _id: tokenDoc._id }, { $set: { usedAt: now } }),
  ]);

  return { ok: true };
}
