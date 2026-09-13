import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/auth-card";
import { RegisterForm } from "@/components/auth/register-form";

export const metadata: Metadata = { title: "Create an account — AasPaas" };

export default function RegisterPage() {
  return (
    <AuthCard
      title="Join AasPaas"
      description="Add places, suggest corrections, and help build the local directory."
    >
      <RegisterForm />
    </AuthCard>
  );
}
