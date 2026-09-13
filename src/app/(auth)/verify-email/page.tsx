import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, XCircle } from "lucide-react";
import { AuthCard } from "@/components/auth/auth-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { verifyEmailToken } from "@/lib/auth/verifyEmailToken";

export const metadata: Metadata = { title: "Verify your email — AasPaas" };

interface VerifyEmailPageProps {
  searchParams: Promise<{ token?: string }>;
}

export default async function VerifyEmailPage({ searchParams }: VerifyEmailPageProps) {
  const { token } = await searchParams;
  const result = token ? await verifyEmailToken(token) : { ok: false as const, error: "Missing verification token." };

  return (
    <AuthCard title="Email verification">
      {result.ok ? (
        <div className="space-y-4">
          <Alert>
            <CheckCircle2 />
            <AlertTitle>Verified</AlertTitle>
            <AlertDescription>Your email is confirmed. You can log in now.</AlertDescription>
          </Alert>
          <Button asChild className="w-full">
            <Link href="/login">Log in</Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <Alert variant="destructive">
            <XCircle />
            <AlertTitle>Couldn&rsquo;t verify</AlertTitle>
            <AlertDescription>{result.error}</AlertDescription>
          </Alert>
          <Button asChild variant="outline" className="w-full">
            <Link href="/register">Back to registration</Link>
          </Button>
        </div>
      )}
    </AuthCard>
  );
}
