"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Flag, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";

const REASONS = [
  { value: "duplicate", label: "This is a duplicate listing" },
  { value: "closed", label: "This place has permanently closed" },
  { value: "wrong_info", label: "Some information is wrong" },
  { value: "spam", label: "This looks like spam" },
  { value: "inappropriate", label: "Inappropriate content" },
  { value: "other", label: "Something else" },
] as const;

export function ReportSheet({
  placeId,
  isAuthenticated,
  loginRedirectTo,
}: {
  placeId: string;
  isAuthenticated: boolean;
  loginRedirectTo: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>("");
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!reason) {
      setError("Pick a reason first.");
      return;
    }
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/places/${placeId}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, details: details || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't file that report. Try again.");
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't file that report. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!isAuthenticated) {
    return (
      <Button variant="ghost" size="sm" asChild>
        <Link href={`/login?next=${encodeURIComponent(loginRedirectTo)}`}>
          <Flag />
          Report
        </Link>
      </Button>
    );
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setSuccess(false);
          setError(null);
          setReason("");
          setDetails("");
        }
      }}
    >
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <Flag />
        Report
      </Button>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Report incorrect info</SheetTitle>
          <SheetDescription>
            Tell us what&apos;s wrong — a moderator reviews every report.
          </SheetDescription>
        </SheetHeader>

        {success ? (
          <div className="px-4">
            <Alert>
              <CheckCircle2 />
              <AlertDescription>Thanks — your report has been filed.</AlertDescription>
            </Alert>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-4 px-4">
            <div className="space-y-1.5">
              <Label htmlFor="report-reason">Reason</Label>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger id="report-reason" className="w-full">
                  <SelectValue placeholder="What's wrong?" />
                </SelectTrigger>
                <SelectContent>
                  {REASONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="report-details">Details (optional)</Label>
              <Textarea
                id="report-details"
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                maxLength={500}
                rows={4}
              />
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <SheetFooter className="px-0">
              <Button type="submit" variant="destructive" className="w-full" disabled={submitting}>
                {submitting && <Spinner />}
                Submit report
              </Button>
            </SheetFooter>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}
