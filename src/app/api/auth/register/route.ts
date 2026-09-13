import { NextResponse, type NextRequest } from "next/server";
import { registerSchema } from "@/lib/validation/auth";
import { getUsersCollection } from "@/lib/db/models/user";
import { getEmailVerificationTokensCollection } from "@/lib/db/models/emailVerificationToken";
import { hashPassword } from "@/lib/auth/password";
import { generateOpaqueToken, hashOpaqueToken } from "@/lib/auth/tokens";
import { sendVerificationEmail } from "@/lib/email/sendVerificationEmail";
import { checkRateLimit } from "@/lib/rateLimit";
import { getClientIp } from "@/lib/http/clientIp";
import type { UserDoc } from "@/types/domain";
import { ObjectId } from "mongodb";

const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

// Not one of the roadmap's explicit tiers (those are all about place
// submissions), but a bare register endpoint is an obvious abuse target —
// capping signups per IP is a cheap, standard mitigation.
const REGISTER_LIMIT = 5;
const REGISTER_WINDOW_MS = 60 * 60 * 1000;

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const rate = await checkRateLimit({
    key: `register:${ip}`,
    limit: REGISTER_LIMIT,
    windowMs: REGISTER_WINDOW_MS,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many accounts created from this network. Try again later." },
      { status: 429 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { displayName, username, email, password } = parsed.data;

  const users = await getUsersCollection();
  const existing = await users.findOne({ $or: [{ username }, { email }] });
  if (existing) {
    const field = existing.username === username ? "username" : "email";
    return NextResponse.json({ error: `That ${field} is already taken.` }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);
  const now = new Date();

  const newUser: UserDoc = {
    _id: new ObjectId(),
    displayName,
    username,
    email,
    emailVerified: false,
    passwordHash,
    roles: ["CONTRIBUTOR"],
    reputationLevel: "newcomer",
    stats: {
      placesAdded: 0,
      placesVerified: 0,
      correctionsMade: 0,
      reportsFiled: 0,
      usefulVotesReceived: 0,
      rejectedSubmissions: 0,
      spamReportsAgainst: 0,
    },
    accountStatus: "active",
    createdAt: now,
    updatedAt: now,
  };

  try {
    await users.insertOne(newUser);
  } catch (err) {
    // Unique-index race: two requests for the same username/email landed
    // between our findOne check and this insert.
    if (isDuplicateKeyError(err)) {
      return NextResponse.json(
        { error: "That username or email is already taken." },
        { status: 409 },
      );
    }
    throw err;
  }

  const rawToken = generateOpaqueToken();
  const emailTokens = await getEmailVerificationTokensCollection();
  await emailTokens.insertOne({
    _id: new ObjectId(),
    userId: newUser._id,
    tokenHash: hashOpaqueToken(rawToken),
    expiresAt: new Date(now.getTime() + EMAIL_VERIFICATION_TTL_MS),
    createdAt: now,
  });

  await sendVerificationEmail({ to: email, displayName, token: rawToken });

  return NextResponse.json(
    { message: "Account created. Check your email to verify your account." },
    { status: 201 },
  );
}

function isDuplicateKeyError(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: number }).code === 11000;
}
