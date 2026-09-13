"use client";

import { useState } from "react";
import Link from "next/link";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { VoteValue } from "@/lib/trust/voteTransition";

interface UsefulVoteButtonsProps {
  placeId: string;
  isAuthenticated: boolean;
  isOwnSubmission: boolean;
  initialUsefulCount: number;
  initialNotUsefulCount: number;
  initialVote: VoteValue | null;
  loginRedirectTo: string;
}

/**
 * Casting, switching, or toggling off a vote all go through the same POST —
 * the server's the source of truth for the resulting counts (see
 * lib/trust/voteTransition.ts), so this only optimistically reflects the
 * button that was just pressed and then reconciles with the response.
 */
export function UsefulVoteButtons({
  placeId,
  isAuthenticated,
  isOwnSubmission,
  initialUsefulCount,
  initialNotUsefulCount,
  initialVote,
  loginRedirectTo,
}: UsefulVoteButtonsProps) {
  const [usefulCount, setUsefulCount] = useState(initialUsefulCount);
  const [notUsefulCount, setNotUsefulCount] = useState(initialNotUsefulCount);
  const [vote, setVote] = useState(initialVote);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cast(value: VoteValue) {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/places/${placeId}/useful`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "That didn't work. Try again.");
      setUsefulCount(data.usefulCount);
      setNotUsefulCount(data.notUsefulCount);
      setVote(data.yourVote);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work. Try again.");
    } finally {
      setPending(false);
    }
  }

  if (!isAuthenticated) {
    return (
      <div className="flex items-center gap-6 text-sm text-muted-foreground">
        <Link href={`/login?next=${encodeURIComponent(loginRedirectTo)}`} className="flex items-center gap-1.5 hover:text-foreground">
          <ThumbsUp className="size-4" />
          {usefulCount} useful
        </Link>
        <Link href={`/login?next=${encodeURIComponent(loginRedirectTo)}`} className="flex items-center gap-1.5 hover:text-foreground">
          <ThumbsDown className="size-4" />
          {notUsefulCount} not useful
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-3 text-sm">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending || isOwnSubmission}
          onClick={() => cast("useful")}
          className={vote === "useful" ? "border-appreciation text-appreciation" : ""}
        >
          {pending ? <Spinner /> : <ThumbsUp />}
          {usefulCount} useful
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending || isOwnSubmission}
          onClick={() => cast("not_useful")}
          className={vote === "not_useful" ? "border-foreground text-foreground" : ""}
        >
          {pending ? <Spinner /> : <ThumbsDown />}
          {notUsefulCount} not useful
        </Button>
      </div>
      {isOwnSubmission && (
        <p className="text-xs text-muted-foreground">You can&apos;t vote on your own submission.</p>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
