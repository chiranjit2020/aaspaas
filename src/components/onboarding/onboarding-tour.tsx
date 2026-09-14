"use client";

import { useEffect, useState } from "react";
import { Search, Plus, ThumbsUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

// Bump this if the tour's content changes meaningfully and it's worth
// showing again to people who already dismissed the old version.
const STORAGE_KEY = "aaspaas-onboarding-v1";

const STEPS = [
  {
    icon: Search,
    title: "Search for what's around you",
    description:
      "Type what you need — \"mobile repair\", a locality, a PIN code — and AasPaas finds real places added by people nearby.",
  },
  {
    icon: Plus,
    title: "Can't find it? Add it.",
    description:
      "Use \"Add Place\" in the header to add a shop, service, or restaurant that's missing. A moderator reviews it before it goes live.",
  },
  {
    icon: ThumbsUp,
    title: "Help keep it accurate",
    description:
      "Vote a listing useful, suggest a correction, or report something that's wrong — that's what keeps the directory trustworthy.",
  },
] as const;

/**
 * A one-time, purely client-side walkthrough for first-time visitors — no
 * DB read or write involved, just localStorage, so it costs nothing on an
 * already-limited database. Shows once ever per browser; skipping and
 * finishing both dismiss it the same way.
 */
export function OnboardingTour() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    // localStorage doesn't exist during SSR, so this has to be an effect,
    // not a lazy useState initializer — the latter would read a value on
    // the server that differs from the client's first real read and trip a
    // hydration mismatch instead of just a component re-render.
    try {
      if (!localStorage.getItem(STORAGE_KEY)) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setOpen(true);
      }
    } catch {
      // Private browsing / storage blocked — just skip the tour rather
      // than risk showing it on every single page load.
    }
  }, []);

  function dismiss() {
    setOpen(false);
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // Nothing to do if storage isn't available — worst case the tour
      // reappears next visit, which is harmless.
    }
  }

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && dismiss()}>
      <DialogContent>
        <DialogHeader>
          <div className="mb-1 flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <current.icon className="size-5" />
          </div>
          <DialogTitle>{current.title}</DialogTitle>
          <DialogDescription>{current.description}</DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-center gap-1.5">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`size-1.5 rounded-full transition-colors ${
                i === step ? "bg-primary" : "bg-muted"
              }`}
            />
          ))}
        </div>

        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={dismiss}>
            Skip
          </Button>
          <Button
            size="sm"
            onClick={() => (isLast ? dismiss() : setStep((s) => s + 1))}
          >
            {isLast ? "Got it" : "Next"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
