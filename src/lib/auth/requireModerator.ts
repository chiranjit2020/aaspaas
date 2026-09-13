import { ObjectId } from "mongodb";
import { getUsersCollection } from "@/lib/db/models/user";
import type { AccessTokenPayload } from "./jwt";
import type { UserDoc } from "@/types/domain";

/**
 * Per §2's "Moderation privilege escalation" row: "Role is re-checked fresh
 * from the DB on every /api/moderation/* call, never trusted from the token
 * alone." A JWT's roles claim is 15 minutes stale by design — if a
 * moderator's access was just revoked, the token wouldn't know yet. This is
 * the one check in the app that's not allowed to trust the JWT payload for
 * anything beyond "who is this."
 */
export type ModeratorCheckResult =
  | { ok: true; moderator: UserDoc }
  | { ok: false; status: 401 | 403; error: string };

export async function assertModerator(
  session: AccessTokenPayload | null,
): Promise<ModeratorCheckResult> {
  if (!session) {
    return { ok: false, status: 401, error: "Not authenticated" };
  }

  const users = await getUsersCollection();
  const user = await users.findOne({ _id: new ObjectId(session.sub) });

  if (!user || user.accountStatus !== "active") {
    return { ok: false, status: 401, error: "Not authenticated" };
  }
  if (!user.roles.includes("MODERATOR") && !user.roles.includes("ADMIN")) {
    return { ok: false, status: 403, error: "Moderator access required" };
  }

  return { ok: true, moderator: user };
}
