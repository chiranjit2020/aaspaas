"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, X, MapPin, TriangleAlert } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { CategoryIcon } from "@/components/places/category-icon";
import type { ModerationQueueItem } from "@/lib/moderation/getModerationQueue";

const DATE_FORMAT = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function ModerationQueue({
  initialItems,
}: {
  initialItems: ModerationQueueItem[];
}) {
  const [items, setItems] = useState(initialItems);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function handleDecision(id: string, decision: "approve" | "reject") {
    setPendingId(id);
    setErrors((prev) => ({ ...prev, [id]: "" }));
    try {
      const res = await fetch(`/api/moderation/places/${id}/${decision}`, {
        method: "POST",
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
    return <p className="text-sm text-muted-foreground">All caught up.</p>;
  }

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground">
        {items.length} place{items.length === 1 ? "" : "s"} waiting for review, oldest
        first.
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
                  Submitted by{" "}
                  {item.contributor ? (
                    <Link
                      href={`/u/${item.contributor.username}`}
                      className="hover:text-foreground hover:underline"
                    >
                      @{item.contributor.username}
                    </Link>
                  ) : (
                    "the community"
                  )}
                </p>

                {item.possibleDuplicateOf && (
                  <div className="flex items-center gap-1.5 rounded-md bg-warning/10 px-2.5 py-1.5 text-xs text-warning">
                    <TriangleAlert className="size-3.5 shrink-0" />
                    Possible duplicate of{" "}
                    <Link
                      href={`/places/${item.possibleDuplicateOf.slug}`}
                      className="underline"
                    >
                      {item.possibleDuplicateOf.name}
                    </Link>
                  </div>
                )}

                {errors[item.id] && (
                  <p className="text-sm text-destructive">{errors[item.id]}</p>
                )}

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
