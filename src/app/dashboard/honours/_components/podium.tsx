import Link from "next/link";
import { StudentAvatar } from "@/components/ui/student-avatar";
import type { HonoursStudent } from "@/lib/honours/honours";
import { ordinal } from "@/lib/honours/score";
import { cn } from "@/lib/utils";

const STEP: Record<
  1 | 2 | 3,
  { ring: string; badge: string; block: string; height: string; avatar: string; order: string }
> = {
  1: {
    ring: "ring-gold",
    badge: "bg-gold-tint text-gold",
    block: "bg-gold-tint",
    height: "h-24",
    avatar: "size-20 text-2xl",
    order: "order-2",
  },
  2: {
    ring: "ring-silver",
    badge: "bg-silver-tint text-silver",
    block: "bg-silver-tint",
    height: "h-16",
    avatar: "size-16 text-xl",
    order: "order-1",
  },
  3: {
    ring: "ring-bronze",
    badge: "bg-bronze-tint text-bronze",
    block: "bg-bronze-tint",
    height: "h-12",
    avatar: "size-14 text-lg",
    order: "order-3",
  },
};

/// The top three, second on the left, first raised in the middle, third on
/// the right. Takes whatever is ranked in the first three rows; a tie shares a
/// step label, and a short section leaves steps empty rather than inventing
/// placings.
export function Podium({ students }: { students: HonoursStudent[] }) {
  const top = students.filter((s) => s.position !== null).slice(0, 3);
  const slots = ([1, 2, 3] as const).map((step) => ({ step, student: top[step - 1] ?? null }));

  return (
    <ol className="grid grid-cols-3 items-end gap-3" aria-label="Podium">
      {slots.map(({ step, student }) => {
        const look = STEP[step];
        return (
          <li key={step} className={cn("flex flex-col items-center", look.order)}>
            {student ? (
              <Link
                href={`/dashboard/students?student=${student.studentId}`}
                className="group flex w-full min-w-0 flex-col items-center gap-2 text-center"
              >
                <StudentAvatar
                  photoId={student.photoId}
                  name={student.fullName}
                  className={cn(
                    "ring-offset-surface rounded-full ring-4 ring-offset-2",
                    look.ring,
                    look.avatar,
                  )}
                />
                <span className="w-full min-w-0">
                  <span className="block truncate font-medium group-hover:underline">
                    {student.fullName}
                  </span>
                  <span className="text-ink-3 block text-[12px]">Roll {student.rollNo}</span>
                </span>
                <span className="font-display text-[22px] leading-none font-semibold tracking-[-0.02em] tabular-nums">
                  {student.overall?.toFixed(1)}
                </span>
              </Link>
            ) : (
              <span className="text-ink-3 text-[12px]">—</span>
            )}
            <span
              className={cn(
                "border-line mt-2 flex w-full items-start justify-center rounded-t-lg border border-b-0 pt-2",
                look.height,
                look.block,
              )}
            >
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-[0.08em] uppercase",
                  look.badge,
                )}
              >
                {student?.position ? ordinal(student.position) : ordinal(step)}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
