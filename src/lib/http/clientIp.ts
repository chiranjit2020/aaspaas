import type { NextRequest } from "next/server";

/**
 * Next.js's App Router doesn't expose request.ip directly (that was a
 * middleware-only, now-removed API), so we read the header Vercel's edge
 * network sets. Falls back to a constant in local dev, where there's no
 * proxy setting it — fine, since rate limits during local dev aren't
 * security-critical anyway.
 */
export function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "127.0.0.1";
}
