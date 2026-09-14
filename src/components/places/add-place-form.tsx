"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
import { CheckCircle2, LocateFixed, MapPin, TriangleAlert } from "lucide-react";
import type { CategorySummary } from "@/lib/db/serialize";
import type { DuplicateMatch } from "@/lib/trust/duplicateDetection";

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
  const [possibleDuplicates, setPossibleDuplicates] = useState<DuplicateMatch[] | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [coordsSource, setCoordsSource] = useState<"auto" | "manual" | null>(null);
  const [manualEntry, setManualEntry] = useState(false);

  function set<K extends keyof typeof EMPTY_FORM>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function useCurrentLocation() {
    setLocationError(null);
    if (!("geolocation" in navigator)) {
      setLocationError("Your browser doesn't support location. Enter coordinates manually below.");
      setManualEntry(true);
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm((prev) => ({
          ...prev,
          lat: pos.coords.latitude.toFixed(6),
          lng: pos.coords.longitude.toFixed(6),
        }));
        setCoordsSource("auto");
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        setLocationError(
          err.code === err.PERMISSION_DENIED
            ? "Location access was denied. Enter coordinates manually below."
            : "Couldn't get your location. Enter coordinates manually below.",
        );
        setManualEntry(true);
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  async function submit(acknowledgeDuplicates: boolean) {
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
          acknowledgeDuplicates,
        }),
      });
      const data = await res.json();

      if (res.status === 409 && data.possibleDuplicates) {
        setPossibleDuplicates(data.possibleDuplicates);
        return;
      }
      if (!res.ok) {
        throw new Error(data.error ?? "Couldn't submit that place. Try again.");
      }

      setPossibleDuplicates(null);
      setSuccess(`${form.name} was submitted and is now pending review.`);
      setForm(EMPTY_FORM);
      setCoordsSource(null);
      setManualEntry(false);
      router.refresh(); // updates the "Your submissions" list below
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't submit that place. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.lat || !form.lng) {
      setError("Add a location — use your current location or enter coordinates manually.");
      return;
    }
    submit(false);
  }

  if (possibleDuplicates) {
    return (
      <div className="space-y-4">
        <Alert>
          <TriangleAlert />
          <AlertTitle>A similar place may already exist</AlertTitle>
          <AlertDescription>
            We found {possibleDuplicates.length === 1 ? "a place" : "places"} that might be the
            same as &ldquo;{form.name}&rdquo;. If one of these is it, go there instead &mdash; no
            need to add it again.
          </AlertDescription>
        </Alert>

        <ul className="space-y-2">
          {possibleDuplicates.map((dup) => (
            <li key={dup.id}>
              <Link
                href={`/places/${dup.slug}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-4 py-3 transition-colors hover:border-primary/50 hover:bg-accent/40"
              >
                <div>
                  <p className="font-medium">{dup.name}</p>
                  <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <MapPin className="size-3.5 text-location" />
                    {dup.locality} &middot; {dup.pincode}
                    {dup.phoneMatch && " · same phone number"}
                  </p>
                </div>
                <span className="shrink-0 text-sm text-primary">This is it &rarr;</span>
              </Link>
            </li>
          ))}
        </ul>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex gap-3">
          <Button variant="outline" onClick={() => setPossibleDuplicates(null)} className="flex-1">
            Go back and edit
          </Button>
          <Button onClick={() => submit(true)} disabled={submitting} className="flex-1">
            {submitting && <Spinner />}
            None of these — add it anyway
          </Button>
        </div>
      </div>
    );
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

      <div className="space-y-1.5">
        <Label>Location</Label>

        {manualEntry ? (
          <div className="space-y-1.5">
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
                  onChange={(e) => {
                    setCoordsSource("manual");
                    set("lat", e.target.value);
                  }}
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
                  onChange={(e) => {
                    setCoordsSource("manual");
                    set("lng", e.target.value);
                  }}
                  required
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Open the place on a map, then copy the latitude/longitude from the URL.
              </p>
              <button
                type="button"
                onClick={() => setManualEntry(false)}
                className="shrink-0 pl-3 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                Use current location instead
              </button>
            </div>
          </div>
        ) : coordsSource === "auto" && form.lat && form.lng ? (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-white/15 bg-background px-3 py-2.5 text-sm">
            <span className="flex items-center gap-2 text-foreground">
              <CheckCircle2 className="size-4 text-primary" />
              Location captured
            </span>
            <button
              type="button"
              onClick={() => setManualEntry(true)}
              className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              Adjust manually
            </button>
          </div>
        ) : (
          <>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={useCurrentLocation}
              disabled={locating}
            >
              {locating ? <Spinner /> : <LocateFixed />}
              {locating ? "Getting your location…" : "Use my current location"}
            </Button>
            <button
              type="button"
              onClick={() => setManualEntry(true)}
              className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              Enter coordinates manually instead
            </button>
          </>
        )}

        {locationError && <p className="text-xs text-destructive">{locationError}</p>}
      </div>

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
