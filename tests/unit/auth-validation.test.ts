import { describe, expect, it } from "vitest";
import { registerSchema, loginSchema, verifyEmailSchema } from "@/lib/validation/auth";

describe("registerSchema", () => {
  const valid = {
    displayName: "Chiranjit",
    username: "chiranjit",
    email: "chiranjit@example.com",
    password: "correct-horse",
  };

  it("accepts a valid registration", () => {
    expect(registerSchema.safeParse(valid).success).toBe(true);
  });

  it("lowercases username and email", () => {
    const result = registerSchema.parse({ ...valid, username: "ChiranJit", email: "Chiranjit@Example.com" });
    expect(result.username).toBe("chiranjit");
    expect(result.email).toBe("chiranjit@example.com");
  });

  it("rejects a username with spaces or symbols", () => {
    expect(registerSchema.safeParse({ ...valid, username: "chiranjit karmakar" }).success).toBe(false);
    expect(registerSchema.safeParse({ ...valid, username: "chiranjit!" }).success).toBe(false);
  });

  it("rejects a username shorter than 3 or longer than 20 characters", () => {
    expect(registerSchema.safeParse({ ...valid, username: "ab" }).success).toBe(false);
    expect(registerSchema.safeParse({ ...valid, username: "a".repeat(21) }).success).toBe(false);
  });

  it("rejects an invalid email", () => {
    expect(registerSchema.safeParse({ ...valid, email: "not-an-email" }).success).toBe(false);
  });

  it("rejects a password shorter than 8 characters", () => {
    expect(registerSchema.safeParse({ ...valid, password: "short1" }).success).toBe(false);
  });

  it("rejects a password longer than 72 characters (bcrypt's limit)", () => {
    expect(registerSchema.safeParse({ ...valid, password: "a".repeat(73) }).success).toBe(false);
  });
});

describe("loginSchema", () => {
  it("accepts a username or an email as the identifier", () => {
    expect(loginSchema.safeParse({ identifier: "chiranjit", password: "x" }).success).toBe(true);
    expect(loginSchema.safeParse({ identifier: "a@b.com", password: "x" }).success).toBe(true);
  });

  it("rejects an empty password", () => {
    expect(loginSchema.safeParse({ identifier: "chiranjit", password: "" }).success).toBe(false);
  });

  it("lowercases the identifier", () => {
    expect(loginSchema.parse({ identifier: "ChiranJit", password: "x" }).identifier).toBe("chiranjit");
  });
});

describe("verifyEmailSchema", () => {
  it("rejects a too-short token", () => {
    expect(verifyEmailSchema.safeParse({ token: "short" }).success).toBe(false);
  });

  it("accepts a plausible token", () => {
    expect(verifyEmailSchema.safeParse({ token: "a".repeat(43) }).success).toBe(true);
  });
});
