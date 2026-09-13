import { cn } from "cn";

/**
 * A monogram avatar (first initial, tinted with the brand accent) — not a
 * fake photo, just a visual anchor so a contributor reads as a person
 * rather than a raw username string. Per review2.md's Stage 2: "the
 * important addition isn't the icon, it's a human behind the data."
 */

const SIZE_CLASSES = {
  sm: "size-4 text-[9px]",
  md: "size-8 text-xs",
  lg: "size-12 text-base",
} as const;

export function ContributorAvatar({
  displayName,
  size = "sm",
  className,
}: {
  displayName: string;
  size?: keyof typeof SIZE_CLASSES;
  className?: string;
}) {
  const initial = displayName.trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-primary/15 font-semibold text-primary",
        SIZE_CLASSES[size],
        className,
      )}
    >
      {initial}
    </span>
  );
}
