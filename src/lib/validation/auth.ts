import { z } from "zod";

/**
 * Registration flow, per 03-community-and-contributors.md: display name ->
 * username -> email -> password -> email verification. Deliberately just
 * those four fields — no phone, DOB, or address at signup.
 */
export const registerSchema = z.object({
  displayName: z.string().trim().min(2).max(60),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_-]{3,20}$/, "3-20 characters: lowercase letters, numbers, _ or -"),
  email: z.string().trim().toLowerCase().email().max(254),
  // bcrypt silently ignores bytes past 72, so cap there rather than lie about it.
  password: z.string().min(8, "at least 8 characters").max(72),
});

export type RegisterInput = z.infer<typeof registerSchema>;

/** Login accepts either a username or an email in the same field. */
export const loginSchema = z.object({
  identifier: z.string().trim().toLowerCase().min(3).max(254),
  password: z.string().min(1),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const verifyEmailSchema = z.object({
  token: z.string().trim().min(20).max(200),
});

export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
