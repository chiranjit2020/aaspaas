/**
 * A monogram avatar (first initial, tinted with the brand accent) — not a
 * fake photo, just a visual anchor so a contributor reads as a person
 * rather than a raw username string. Per review2.md's Stage 2: "the
 * important addition isn't the icon, it's a human behind the data."
 */
export function ContributorAvatar({
  displayName,
  className,
}: {
  displayName: string;
  className?: string;
}) {
  const initial = displayName.trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      aria-hidden="true"
      className={`inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[9px] font-semibold text-primary ${className ?? ""}`}
    >
      {initial}
    </span>
  );
}
