import { config } from "dotenv";
import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Standalone scripts (run via `tsx`, outside the Next.js process) don't get
 * Next.js's automatic .env.local loading, so we do it ourselves. .env.local wins
 * over .env when both exist, matching Next.js's own precedence.
 */
export function loadEnv(): void {
  const root = process.cwd();
  const envLocal = path.join(root, ".env.local");
  const envDefault = path.join(root, ".env");
  if (existsSync(envLocal)) config({ path: envLocal });
  else if (existsSync(envDefault)) config({ path: envDefault });
}
