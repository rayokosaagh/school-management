import { cn } from "@/lib/utils";

export function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

/// The photo from our own route, or an initials tile in the brand tint. The
/// pane and the podium share it so a student looks the same everywhere.
export function StudentAvatar({
  photoId,
  name,
  className,
}: {
  photoId: number | null;
  name: string;
  className?: string;
}) {
  if (photoId) {
    return (
      // Served from our own authenticated route; next/image would add nothing
      // for a private thumbnail.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/api/photo/${photoId}`}
        alt=""
        className={cn("size-13 shrink-0 rounded-xl object-cover", className)}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        "from-brand-tint-2 to-brand-tint text-brand-text font-display grid size-13 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-lg font-bold",
        className,
      )}
    >
      {initialsOf(name)}
    </span>
  );
}
