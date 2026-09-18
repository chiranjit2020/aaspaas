"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Camera, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Alert, AlertDescription } from "@/components/ui/alert";

/** Mirrors ReportSheet's logged-out fallback: a plain login link, no dialog. */
export function PhotoUpload({
  placeId,
  isAuthenticated,
  loginRedirectTo,
}: {
  placeId: string;
  isAuthenticated: boolean;
  loginRedirectTo: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file after an error
    if (!file) return;

    setSubmitting(true);
    setError(null);
    setSuccess(false);

    try {
      const body = new FormData();
      body.set("file", file);
      const res = await fetch(`/api/places/${placeId}/photos`, { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't upload that photo. Try again.");
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't upload that photo. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!isAuthenticated) {
    return (
      <Button variant="ghost" size="sm" asChild>
        <Link href={`/login?next=${encodeURIComponent(loginRedirectTo)}`}>
          <Camera />
          Add a photo
        </Link>
      </Button>
    );
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFileChange}
      />
      <Button
        variant="ghost"
        size="sm"
        disabled={submitting}
        onClick={() => inputRef.current?.click()}
      >
        {submitting ? <Spinner /> : <Camera />}
        Add a photo
      </Button>
      {success && (
        <Alert className="max-w-sm">
          <CheckCircle2 />
          <AlertDescription>Thanks — your photo is waiting on moderator review.</AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive" className="max-w-sm">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
