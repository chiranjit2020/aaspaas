import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = { title: "Log in — AasPaas" };

export default function LoginPage() {
  return (
    <AuthCard title="Welcome back" description="Log in to add and manage your places.">
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthCard>
  );
}
