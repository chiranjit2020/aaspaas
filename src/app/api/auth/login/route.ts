import { NextResponse, type NextRequest } from "next/server";
import { ObjectId } from "mongodb";
import { loginSchema } from "@/lib/validation/auth";
import { getUsersCollection } from "@/lib/db/models/user";
import { getRefreshTokensCollection } from "@/lib/db/models/refreshToken";
import { verifyPassword } from "@/lib/auth/password";
import { signAccessToken } from "@/lib/auth/jwt";
import { generateOpaqueToken, hashOpaqueToken } from "@/lib/auth/tokens";
import { setAuthCookies, REFRESH_TOKEN_TTL_DAYS } from "@/lib/auth/session";
import { checkRateLimit } from "@/lib/rateLimit";
import { getClientIp } from "@/lib/http/clientIp";
import { toUserProfile } from "@/lib/db/serialize";

// §2.1: "5 attempts / 15 min per IP+username" (see lib/rateLimit's module
// comment for how this differs from true exponential backoff).
const LOGIN_LIMIT = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { identifier, password } = parsed.data;

  const ip = getClientIp(request);
  const rate = await checkRateLimit({
    key: `login:${ip}:${identifier}`,
    limit: LOGIN_LIMIT,
    windowMs: LOGIN_WINDOW_MS,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Try again in a few minutes." },
      { status: 429 },
    );
  }

  const users = await getUsersCollection();
  const user = await users.findOne({ $or: [{ username: identifier }, { email: identifier }] });

  // Same generic error whether the account doesn't exist or the password is
  // wrong — don't let a login form enumerate registered accounts.
  const invalidCredentials = () =>
    NextResponse.json({ error: "Invalid username/email or password." }, { status: 401 });

  if (!user) return invalidCredentials();
  const validPassword = await verifyPassword(password, user.passwordHash);
  if (!validPassword) return invalidCredentials();

  if (user.accountStatus !== "active") {
    return NextResponse.json(
      { error: "This account is no longer active." },
      { status: 403 },
    );
  }

  const now = new Date();
  await users.updateOne({ _id: user._id }, { $set: { lastLoginAt: now } });

  const accessToken = await signAccessToken({
    sub: user._id.toHexString(),
    username: user.username,
    roles: user.roles,
    emailVerified: user.emailVerified,
  });

  const rawRefreshToken = generateOpaqueToken();
  const refreshTokens = await getRefreshTokensCollection();
  await refreshTokens.insertOne({
    _id: new ObjectId(),
    userId: user._id,
    tokenHash: hashOpaqueToken(rawRefreshToken),
    issuedAt: now,
    expiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000),
    revoked: false,
    userAgent: request.headers.get("user-agent") ?? undefined,
  });

  const response = NextResponse.json(toUserProfile(user));
  setAuthCookies(response, { accessToken, refreshToken: rawRefreshToken });
  return response;
}
