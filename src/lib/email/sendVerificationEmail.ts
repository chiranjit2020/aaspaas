import { Resend } from "resend";

/**
 * Transactional email — Resend free tier, per roadmap §4/M2. If
 * RESEND_API_KEY isn't set (e.g. local dev before you've created a Resend
 * account), this logs the verification link instead of failing the request,
 * so the register -> verify -> login flow stays testable end to end without
 * a live email provider. Wire in a real key in .env.local when you have one;
 * no code change needed.
 */

function getBaseUrl(): string {
  return process.env.APP_BASE_URL ?? "http://localhost:3000";
}

export async function sendVerificationEmail(params: {
  to: string;
  displayName: string;
  token: string;
}): Promise<void> {
  const verifyUrl = `${getBaseUrl()}/verify-email?token=${encodeURIComponent(params.token)}`;
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.log(
      `[email:dev-fallback] Verification link for ${params.to}: ${verifyUrl}`,
    );
    return;
  }

  const resend = new Resend(apiKey);
  const from = process.env.EMAIL_FROM ?? "AasPaas <onboarding@resend.dev>";

  const { error } = await resend.emails.send({
    from,
    to: params.to,
    subject: "Verify your AasPaas account",
    html: `
      <p>Hi ${params.displayName},</p>
      <p>Welcome to AasPaas — confirm your email to finish setting up your account:</p>
      <p><a href="${verifyUrl}">${verifyUrl}</a></p>
      <p>This link expires in 24 hours. If you didn't create this account, you can ignore this email.</p>
    `,
  });

  if (error) {
    console.error("Failed to send verification email:", error);
    throw new Error("Failed to send verification email");
  }
}
