import type { Collection } from "mongodb";
import { getDb } from "@/lib/db/connect";
import type { EmailVerificationTokenDoc } from "@/types/domain";

export const EMAIL_VERIFICATION_TOKENS_COLLECTION = "email_verification_tokens";

export async function getEmailVerificationTokensCollection(): Promise<
  Collection<EmailVerificationTokenDoc>
> {
  const db = await getDb();
  return db.collection<EmailVerificationTokenDoc>(EMAIL_VERIFICATION_TOKENS_COLLECTION);
}
