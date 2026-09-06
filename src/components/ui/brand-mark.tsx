import { cn } from "@/lib/utils";

/// The school's initial on the brand gradient. Used in the top bar; the auth
/// pages adopt it in Phase 3.
export function BrandMark({
  name,
  logoId,
  size = "md",
  className,
}: {
  name: string;
  logoId?: number | null;
  size?: "md" | "lg";
  className?: string;
}) {
  const initial = (name.trim()[0] ?? "S").toUpperCase();
  return (
    <span
      aria-hidden="true"
      className={cn(
        "font-display grid shrink-0 place-items-center overflow-hidden font-bold tracking-tight",
        size === "md" ? "size-8 rounded-[9px] text-[15px]" : "size-14 rounded-2xl text-2xl",
        logoId
          ? "bg-surface border-line border"
          : "from-brand to-brand-deep text-brand-ink bg-gradient-to-br",
        className,
      )}
    >
      {logoId ? (
        // The saved logo is public branding and its id changes on replacement,
        // which gives the browser a fresh URL after Settings is saved.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/school-logo?v=${logoId}`}
          alt=""
          className="size-full object-contain"
        />
      ) : (
        initial
      )}
    </span>
  );
}
