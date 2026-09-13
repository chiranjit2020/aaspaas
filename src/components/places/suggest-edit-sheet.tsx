"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Pencil, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";

interface CurrentPlaceValues {
  name: string;
  description?: string;
  phone?: string;
  district: string;
  locality: string;
  pincode: string;
  address?: string;
}

export function SuggestEditSheet({
  placeId,
  current,
  isAuthenticated,
  loginRedirectTo,
}: {
  placeId: string;
  current: CurrentPlaceValues;
  isAuthenticated: boolean;
  loginRedirectTo: string;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: current.name,
    description: current.description ?? "",
    phone: current.phone ?? "",
    district: current.district,
    locality: current.locality,
    pincode: current.pincode,
    address: current.address ?? "",
    reason: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    // Only send fields that actually differ — the server drops no-op values
    // too, but sending only real changes keeps the diff (and the reason
    // field, if any) honest about what's actually being proposed.
    const payload: Record<string, string> = {};
    if (form.name !== current.name) payload.name = form.name;
    if (form.description !== (current.description ?? "")) payload.description = form.description;
    if (form.phone !== (current.phone ?? "")) payload.phone = form.phone;
    if (form.district !== current.district) payload.district = form.district;
    if (form.locality !== current.locality) payload.locality = form.locality;
    if (form.pincode !== current.pincode) payload.pincode = form.pincode;
    if (form.address !== (current.address ?? "")) payload.address = form.address;
    if (form.reason.trim()) payload.reason = form.reason.trim();

    try {
      const res = await fetch(`/api/places/${placeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't submit that edit. Try again.");
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't submit that edit. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!isAuthenticated) {
    return (
      <Button variant="outline" size="sm" asChild>
        <Link href={`/login?next=${encodeURIComponent(loginRedirectTo)}`}>
          <Pencil />
          Suggest an edit
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
        }
      }}
    >
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Pencil />
        Suggest an edit
      </Button>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Suggest an edit</SheetTitle>
          <SheetDescription>
            Change only what&apos;s wrong — a moderator reviews every suggestion before it goes live.
          </SheetDescription>
        </SheetHeader>

        {success ? (
          <div className="px-4">
            <Alert>
              <CheckCircle2 />
              <AlertDescription>
                Thanks — your suggestion is pending review.
              </AlertDescription>
            </Alert>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-4 overflow-y-auto px-4">
            <div className="space-y-1.5">
              <Label htmlFor="edit-name">Name</Label>
              <Input id="edit-name" value={form.name} onChange={(e) => set("name", e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                maxLength={1000}
                rows={3}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-phone">Phone</Label>
              <Input id="edit-phone" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-address">Address</Label>
              <Input id="edit-address" value={form.address} onChange={(e) => set("address", e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="edit-locality">Locality</Label>
                <Input
                  id="edit-locality"
                  value={form.locality}
                  onChange={(e) => set("locality", e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-district">District</Label>
                <Input
                  id="edit-district"
                  value={form.district}
                  onChange={(e) => set("district", e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-pincode">PIN code</Label>
              <Input
                id="edit-pincode"
                value={form.pincode}
                onChange={(e) => set("pincode", e.target.value)}
                pattern="\d{6}"
                title="6 digits"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-reason">Why? (optional)</Label>
              <Textarea
                id="edit-reason"
                value={form.reason}
                onChange={(e) => set("reason", e.target.value)}
                maxLength={300}
                rows={2}
                placeholder="e.g. the number on the shop's board changed"
              />
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <SheetFooter className="px-0">
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting && <Spinner />}
                Submit suggestion
              </Button>
            </SheetFooter>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}
