"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, X, MapPin, TriangleAlert, Pencil, Flag, Eye, ShieldAlert } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CategoryIcon } from "@/components/places/category-icon";
import type {
  EditQueueItem,
  ModerationQueue as ModerationQueueData,
  ModerationQueueItem,
  ReportQueueItem,
  WatchlistItem,
} from "@/lib/moderation/getModerationQueue";

const DATE_FORMAT = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const FIELD_LABELS: Record<string, string> = {
  name: "Name",
  description: "Description",
  phone: "Phone",
  district: "District",
  locality: "Locality",
  pincode: "PIN code",
  address: "Address",
};

const REPORT_REASON_LABELS: Record<string, string> = {
  duplicate: "Duplicate",
  closed: "Permanently closed",
  wrong_info: "Wrong info",
  spam: "Spam",
  inappropriate: "Inappropriate",
  other: "Other",
};

function Contributor({ contributor }: { contributor: { username: string } | null }) {
  return contributor ? (
    <Link href={`/u/${contributor.username}`} className="hover:text-foreground hover:underline">
      @{contributor.username}
    </Link>
  ) : (
    <>the community</>
  );
}

export function ModerationQueue({ initialQueue }: { initialQueue: ModerationQueueData }) {
  const [places, setPlaces] = useState(initialQueue.places);
  const [edits, setEdits] = useState(initialQueue.edits);
  const [reports, setReports] = useState(initialQueue.reports);
  const [watchlist, setWatchlist] = useState(initialQueue.watchlist);

  return (
    <Tabs defaultValue="places">
      <TabsList>
        <TabsTrigger value="places">Places ({places.length})</TabsTrigger>
        <TabsTrigger value="edits">Edits ({edits.length})</TabsTrigger>
        <TabsTrigger value="reports">Reports ({reports.length})</TabsTrigger>
        <TabsTrigger value="watchlist">Watchlist ({watchlist.length})</TabsTrigger>
      </TabsList>
      <TabsContent value="places" className="pt-4">
        <PlacesTab items={places} setItems={setPlaces} />
      </TabsContent>
      <TabsContent value="edits" className="pt-4">
        <EditsTab items={edits} setItems={setEdits} />
      </TabsContent>
      <TabsContent value="reports" className="pt-4">
        <ReportsTab items={reports} setItems={setReports} />
      </TabsContent>
      <TabsContent value="watchlist" className="pt-4">
        <WatchlistTab items={watchlist} setItems={setWatchlist} />
      </TabsContent>
    </Tabs>
  );
}

function PlacesTab({
  items,
  setItems,
}: {
  items: ModerationQueueItem[];
  setItems: React.Dispatch<React.SetStateAction<ModerationQueueItem[]>>;
}) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function handleDecision(id: string, decision: "approve" | "reject") {
    setPendingId(id);
    setErrors((prev) => ({ ...prev, [id]: "" }));
    try {
      const res = await fetch(`/api/moderation/places/${id}/${decision}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "That didn't work. Try again.");
      setItems((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      setErrors((prev) => ({
        ...prev,
        [id]: err instanceof Error ? err.message : "That didn't work. Try again.",
      }));
    } finally {
      setPendingId(null);
    }
  }

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">All caught up.</p>;
  }

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground">
        {items.length} place{items.length === 1 ? "" : "s"} waiting for review, oldest first.
      </p>
      <ul className="space-y-4">
        {items.map((item) => (
          <li key={item.id}>
            <Card>
              <CardContent className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold leading-snug">{item.name}</h3>
                    <Badge variant="secondary" className="mt-1.5 gap-1 font-normal">
                      <CategoryIcon name={item.category.icon} className="size-3.5" />
                      {item.category.name}
                    </Badge>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {DATE_FORMAT.format(new Date(item.createdAt))}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <MapPin className="size-3.5 shrink-0 text-location" />
                  {item.locality}, {item.district} &mdash; {item.pincode}
                  {item.phone && <span>&middot; {item.phone}</span>}
                </div>

                {item.description && <p className="text-sm">{item.description}</p>}

                <p className="text-xs text-muted-foreground">
                  Submitted by <Contributor contributor={item.contributor} />
                </p>

                {item.possibleDuplicateOf && (
                  <div className="flex items-center gap-1.5 rounded-md bg-warning/10 px-2.5 py-1.5 text-xs text-warning">
                    <TriangleAlert className="size-3.5 shrink-0" />
                    Possible duplicate of{" "}
                    <Link href={`/places/${item.possibleDuplicateOf.slug}`} className="underline">
                      {item.possibleDuplicateOf.name}
                    </Link>
                  </div>
                )}

                {errors[item.id] && <p className="text-sm text-destructive">{errors[item.id]}</p>}

                <div className="flex gap-3 pt-1">
                  <Button
                    onClick={() => handleDecision(item.id, "approve")}
                    disabled={pendingId === item.id}
                    className="flex-1"
                  >
                    {pendingId === item.id ? <Spinner /> : <Check />}
                    Approve
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => handleDecision(item.id, "reject")}
                    disabled={pendingId === item.id}
                    className="flex-1"
                  >
                    {pendingId === item.id ? <Spinner /> : <X />}
                    Reject
                  </Button>
                </div>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EditsTab({
  items,
  setItems,
}: {
  items: EditQueueItem[];
  setItems: React.Dispatch<React.SetStateAction<EditQueueItem[]>>;
}) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function handleDecision(id: string, decision: "approve" | "reject") {
    setPendingId(id);
    setErrors((prev) => ({ ...prev, [id]: "" }));
    try {
      const res = await fetch(`/api/moderation/edits/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "That didn't work. Try again.");
      setItems((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      setErrors((prev) => ({
        ...prev,
        [id]: err instanceof Error ? err.message : "That didn't work. Try again.",
      }));
    } finally {
      setPendingId(null);
    }
  }

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">No suggested edits waiting.</p>;
  }

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground">
        {items.length} suggested edit{items.length === 1 ? "" : "s"} waiting for review.
      </p>
      <ul className="space-y-4">
        {items.map((item) => (
          <li key={item.id}>
            <Card>
              <CardContent className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-1.5 font-semibold leading-snug">
                    <Pencil className="size-4 shrink-0 text-muted-foreground" />
                    <Link href={`/places/${item.place.slug}`} className="hover:underline">
                      {item.place.name}
                    </Link>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {DATE_FORMAT.format(new Date(item.createdAt))}
                  </span>
                </div>

                <dl className="space-y-1.5 rounded-md bg-muted/50 p-3 text-sm">
                  {Object.entries(item.changes).map(([field, change]) => (
                    <div key={field} className="flex flex-wrap items-baseline gap-x-1.5">
                      <dt className="font-medium">{FIELD_LABELS[field] ?? field}:</dt>
                      <dd className="text-muted-foreground line-through">
                        {String(change.old ?? "—")}
                      </dd>
                      <dd className="font-medium text-success">→ {String(change.new)}</dd>
                    </div>
                  ))}
                </dl>

                {item.reason && (
                  <p className="text-sm italic text-muted-foreground">&ldquo;{item.reason}&rdquo;</p>
                )}

                <p className="text-xs text-muted-foreground">
                  Suggested by <Contributor contributor={item.contributor} />
                </p>

                {errors[item.id] && <p className="text-sm text-destructive">{errors[item.id]}</p>}

                <div className="flex gap-3 pt-1">
                  <Button
                    onClick={() => handleDecision(item.id, "approve")}
                    disabled={pendingId === item.id}
                    className="flex-1"
                  >
                    {pendingId === item.id ? <Spinner /> : <Check />}
                    Approve
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => handleDecision(item.id, "reject")}
                    disabled={pendingId === item.id}
                    className="flex-1"
                  >
                    {pendingId === item.id ? <Spinner /> : <X />}
                    Reject
                  </Button>
                </div>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ReportsTab({
  items,
  setItems,
}: {
  items: ReportQueueItem[];
  setItems: React.Dispatch<React.SetStateAction<ReportQueueItem[]>>;
}) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function handleResolve(id: string, resolution: "kept" | "corrected" | "removed") {
    setPendingId(id);
    setErrors((prev) => ({ ...prev, [id]: "" }));
    try {
      const res = await fetch(`/api/moderation/reports/${id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolution }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "That didn't work. Try again.");
      setItems((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      setErrors((prev) => ({
        ...prev,
        [id]: err instanceof Error ? err.message : "That didn't work. Try again.",
      }));
    } finally {
      setPendingId(null);
    }
  }

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">No open reports.</p>;
  }

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground">
        {items.length} open report{items.length === 1 ? "" : "s"}, oldest first.
      </p>
      <ul className="space-y-4">
        {items.map((item) => (
          <li key={item.id}>
            <Card>
              <CardContent className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-1.5 font-semibold leading-snug">
                    <Flag className="size-4 shrink-0 text-destructive" />
                    <Link href={`/places/${item.place.slug}`} className="hover:underline">
                      {item.place.name}
                    </Link>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {DATE_FORMAT.format(new Date(item.createdAt))}
                  </span>
                </div>

                <Badge variant="secondary" className="font-normal">
                  {REPORT_REASON_LABELS[item.reason] ?? item.reason}
                </Badge>

                {item.details && <p className="text-sm">{item.details}</p>}

                <p className="text-xs text-muted-foreground">
                  Reported by <Contributor contributor={item.contributor} />
                </p>

                {errors[item.id] && <p className="text-sm text-destructive">{errors[item.id]}</p>}

                <div className="flex flex-wrap gap-3 pt-1">
                  <Button
                    variant="outline"
                    onClick={() => handleResolve(item.id, "kept")}
                    disabled={pendingId === item.id}
                    className="flex-1"
                  >
                    {pendingId === item.id ? <Spinner /> : <Check />}
                    Keep as-is
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => handleResolve(item.id, "corrected")}
                    disabled={pendingId === item.id}
                    className="flex-1"
                  >
                    Mark corrected
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => handleResolve(item.id, "removed")}
                    disabled={pendingId === item.id}
                    className="flex-1"
                  >
                    {pendingId === item.id ? <Spinner /> : <X />}
                    Remove place
                  </Button>
                </div>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}

function WatchlistTab({
  items,
  setItems,
}: {
  items: WatchlistItem[];
  setItems: React.Dispatch<React.SetStateAction<WatchlistItem[]>>;
}) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function handleAction(id: string, action: "dismiss" | "remove") {
    setPendingId(id);
    setErrors((prev) => ({ ...prev, [id]: "" }));
    try {
      const res = await fetch(`/api/moderation/watchlist/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "That didn't work. Try again.");
      setItems((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      setErrors((prev) => ({
        ...prev,
        [id]: err instanceof Error ? err.message : "That didn't work. Try again.",
      }));
    } finally {
      setPendingId(null);
    }
  }

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">Nothing flagged for review.</p>;
  }

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground">
        {items.length} live listing{items.length === 1 ? "" : "s"} flagged by the spam score —
        these are already public, just worth a look.
      </p>
      <ul className="space-y-4">
        {items.map((item) => (
          <li key={item.id}>
            <Card>
              <CardContent className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-1.5 font-semibold leading-snug">
                      <ShieldAlert className="size-4 shrink-0 text-warning" />
                      <Link href={`/places/${item.slug}`} className="hover:underline">
                        {item.name}
                      </Link>
                    </div>
                    <Badge variant="secondary" className="mt-1.5 gap-1 font-normal">
                      <CategoryIcon name={item.category.icon} className="size-3.5" />
                      {item.category.name}
                    </Badge>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {DATE_FORMAT.format(new Date(item.createdAt))}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <MapPin className="size-3.5 shrink-0 text-location" />
                  {item.locality}, {item.district} &mdash; {item.pincode}
                </div>

                <div className="flex items-center gap-1.5 text-xs text-warning">
                  <TriangleAlert className="size-3.5 shrink-0" />
                  Spam score: {item.spamScore}/100
                </div>
                {item.spamReasons.length > 0 && (
                  <ul className="list-inside list-disc text-xs text-muted-foreground">
                    {item.spamReasons.map((reason, i) => (
                      <li key={i}>{reason}</li>
                    ))}
                  </ul>
                )}

                <p className="text-xs text-muted-foreground">
                  Submitted by <Contributor contributor={item.contributor} />
                </p>

                {errors[item.id] && <p className="text-sm text-destructive">{errors[item.id]}</p>}

                <div className="flex gap-3 pt-1">
                  <Button
                    variant="outline"
                    onClick={() => handleAction(item.id, "dismiss")}
                    disabled={pendingId === item.id}
                    className="flex-1"
                  >
                    {pendingId === item.id ? <Spinner /> : <Eye />}
                    Looks fine
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => handleAction(item.id, "remove")}
                    disabled={pendingId === item.id}
                    className="flex-1"
                  >
                    {pendingId === item.id ? <Spinner /> : <X />}
                    Remove place
                  </Button>
                </div>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
