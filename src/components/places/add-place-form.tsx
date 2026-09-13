"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CheckCircle2 } from "lucide-react";
import type { CategorySummary } from "@/lib/db/serialize";

interface CategoryGroup {
  parent: CategorySummary;
  children: CategorySummary[];
}

const EMPTY_FORM = {
  name: "",
  categorySlug: "",
  description: "",
  phone: "",
  district: "",
  locality: "",
  pincode: "",
  address: "",
  lat: "",
  lng: "",
};

export function AddPlaceForm({ categoryGroups }: { categoryGroups: CategoryGroup[] }) {
  const router = useRouter();
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function set<K extends keyof typeof EMPTY_FORM>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/places", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          categorySlug: form.categorySlug,
          description: form.description || undefined,
          phone: form.phone || undefined,
          district: form.district,
          locality: form.locality,
          pincode: form.pincode,
          address: form.address || undefined,
          lat: Number(form.lat),
          lng: Number(form.lng),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Couldn't submit that place. Try again.");
      }
      setSuccess(`${form.name} was submitted and is now pending review.`);
      setForm(EMPTY_FORM);
      router.refresh(); // updates the "Your submissions" list below
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't submit that place. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="name">Place name</Label>
        <Input id="name" value={form.name} onChange={(e) => set("name", e.target.value)} required />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="category">Category</Label>
        <Select value={form.categorySlug} onValueChange={(v) => set("categorySlug", v)} required>
          <SelectTrigger id="category" className="w-full">
            <SelectValue placeholder="What kind of place is it?" />
          </SelectTrigger>
          <SelectContent>
            {categoryGroups.map((group) => (
              <SelectGroup key={group.parent.id}>
                <SelectLabel>{group.parent.name}</SelectLabel>
                {group.children.map((child) => (
                  <SelectItem key={child.id} value={child.slug}>
                    {child.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">Description (optional)</Label>
        <Textarea
          id="description"
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
          maxLength={1000}
          rows={3}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="phone">Phone (optional)</Label>
        <Input id="phone" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="district">District</Label>
          <Input id="district" value={form.district} onChange={(e) => set("district", e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="locality">Locality</Label>
          <Input id="locality" value={form.locality} onChange={(e) => set("locality", e.target.value)} required />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="pincode">PIN code</Label>
          <Input
            id="pincode"
            value={form.pincode}
            onChange={(e) => set("pincode", e.target.value)}
            pattern="\d{6}"
            title="6 digits"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="address">Address (optional)</Label>
          <Input id="address" value={form.address} onChange={(e) => set("address", e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="lat">Latitude</Label>
          <Input
            id="lat"
            type="number"
            step="any"
            min={-90}
            max={90}
            value={form.lat}
            onChange={(e) => set("lat", e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lng">Longitude</Label>
          <Input
            id="lng"
            type="number"
            step="any"
            min={-180}
            max={180}
            value={form.lng}
            onChange={(e) => set("lng", e.target.value)}
            required
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Approximate coordinates are fine — open the place on a map, then copy the
        latitude/longitude from the URL. Pin-and-drop map picking lands in a later
        milestone.
      </p>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {success && (
        <Alert>
          <CheckCircle2 />
          <AlertTitle>Submitted</AlertTitle>
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}

      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting && <Spinner />}
        Submit place
      </Button>
    </form>
  );
}
