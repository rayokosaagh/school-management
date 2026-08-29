import { cn } from "@/lib/utils";

/// The school's initial on the brand gradient. Used in the top bar and on the
/// auth pages so the same mark greets people before and after sign-in.
export function BrandMark({
  name,
  size = "md",
  className,
}: {
  name: string;
  size?: "md" | "lg";
  className?: string;
}) {
  const initial = (name.trim()[0] ?? "S").toUpperCase();
  return (
    <span
      aria-hidden="true"
      className={cn(
        "from-brand to-brand-deep text-brand-ink font-display grid shrink-0 place-items-center bg-gradient-to-br font-bold tracking-tight",
        size === "md" ? "size-8 rounded-[9px] text-[15px]" : "size-14 rounded-2xl text-2xl",
        className,
      )}
    >
      {initial}
    </span>
  );
}
