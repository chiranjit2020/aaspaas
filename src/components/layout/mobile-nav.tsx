"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, Plus, ShieldCheck, User, LogIn, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LogoutButton } from "@/components/auth/logout-button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

interface MobileNavProps {
  isLoggedIn: boolean;
  username?: string;
  isModerator: boolean;
}

/**
 * The header's inline button row (Add Place, Moderate, @username, auth
 * actions) reads as clutter once it's four-plus items wide on a phone — this
 * collapses all of it behind a single hamburger below the sm breakpoint.
 * Desktop keeps the original inline row (see SiteHeader) untouched.
 */
export function MobileNav({ isLoggedIn, username, isModerator }: MobileNavProps) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Button
        variant="ghost"
        size="icon-sm"
        className="sm:hidden"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
      >
        <Menu />
      </Button>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>Menu</SheetTitle>
        </SheetHeader>

        <nav className="flex flex-col gap-1 px-4">
          <Button asChild variant="ghost" className="justify-start" onClick={() => setOpen(false)}>
            <Link href="/add-place">
              <Plus />
              Add Place
            </Link>
          </Button>

          {isLoggedIn ? (
            <>
              {isModerator && (
                <Button asChild variant="ghost" className="justify-start" onClick={() => setOpen(false)}>
                  <Link href="/moderation">
                    <ShieldCheck />
                    Moderate
                  </Link>
                </Button>
              )}
              <Button asChild variant="ghost" className="justify-start" onClick={() => setOpen(false)}>
                <Link href={`/u/${username}`}>
                  <User />@{username}
                </Link>
              </Button>
              <div className="mt-2 flex flex-col border-t border-border/60 pt-2">
                <LogoutButton />
              </div>
            </>
          ) : (
            <>
              <Button asChild variant="ghost" className="justify-start" onClick={() => setOpen(false)}>
                <Link href="/login">
                  <LogIn />
                  Log in
                </Link>
              </Button>
              <Button asChild className="justify-start" onClick={() => setOpen(false)}>
                <Link href="/register">
                  <UserPlus />
                  Sign up
                </Link>
              </Button>
            </>
          )}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
