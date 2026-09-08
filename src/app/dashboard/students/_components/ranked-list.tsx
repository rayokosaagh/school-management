import { TranslatedText } from "@/components/i18n/language-provider";
import Link from "next/link";
import { StudentAvatar } from "@/components/ui/student-avatar";
import { PersonName } from "@/components/ui/person-name";
import type { HonoursStudent } from "@/lib/honours/honours";
import { rankedListRows } from "@/lib/honours/podium";
import { ordinal } from "@/lib/honours/score";

function Pillar({ label, value }: { label: string; value: number | null }) {
  return (
    <span className="text-ink-3 font-mono text-[11.5px] tabular-nums">
      <span className="opacity-70">{label}</span> {value === null ? "—" : Math.round(value)}
    </span>
  );
}

function Row({ s }: { s: HonoursStudent }) {
  return (
    <li>
      <Link
        href={`/dashboard/students?student=${s.studentId}`}
        className="hover:bg-surface-2 grid grid-cols-[2.5rem_2rem_1fr_auto] items-center gap-3 rounded-lg px-2 py-1.5"
      >
        <span className="text-ink-2 font-mono text-[12.5px] tabular-nums">
          {s.position === null ? "—" : ordinal(s.position)}
        </span>
        <StudentAvatar photoId={s.photoId} name={s.fullName} className="size-8 rounded-lg text-xs" />
        <span className="min-w-0">
          <PersonName
            en={s.fullName}
            np={s.fullNameNp}
            suffix={<span className="text-ink-3 font-normal"><TranslatedText> · Roll </TranslatedText>{s.rollNo}</span>}
          />
          <span className="flex flex-wrap gap-x-3">
            <Pillar label="Exam" value={s.pillars.exams} />
            <Pillar label="Att" value={s.pillars.attendance} />
            <Pillar label="Cond" value={s.pillars.conduct} />
            <Pillar label="Act" value={s.pillars.activities} />
          </span>
        </span>
        <span className="flex items-center gap-2">
          <span
            className="bg-line hidden h-1.5 w-[72px] overflow-hidden rounded-full sm:block"
            aria-hidden="true"
          >
            <i className="bg-brand block h-full" style={{ width: `${s.overall ?? 0}%` }} />
          </span>
          <span className="w-11 text-right font-mono text-[13px] tabular-nums">
            {s.overall === null ? "—" : s.overall.toFixed(1)}
          </span>
        </span>
      </Link>
    </li>
  );
}

/// Everyone after the podium, then the unranked in their own group so the
/// "—" rows do not read as last place. `students` should be a section's full
/// roster, same as `Podium` — `query` narrows what this list shows without
/// touching which three are past it; see `rankedListRows`.
export function RankedList({ students, query = "" }: { students: HonoursStudent[]; query?: string }) {
  const { ranked, waiting } = rankedListRows(students, query);
  const searching = query.trim() !== "";

  return (
    <div className="space-y-3">
      {ranked.length > 0 ? (
        <ol className="space-y-0.5">
          {ranked.map((s) => (
            <Row key={s.studentId} s={s} />
          ))}
        </ol>
      ) : null}
      {waiting.length > 0 ? (
        <div>
          <p className="text-ink-3 mb-1 px-2 text-[11px] font-medium tracking-[0.1em] uppercase"><TranslatedText>
            Awaiting a published result · </TranslatedText>{waiting.length}
          </p>
          <ul className="space-y-0.5 opacity-75">
            {waiting.map((s) => (
              <Row key={s.studentId} s={s} />
            ))}
          </ul>
        </div>
      ) : null}
      {searching && ranked.length === 0 && waiting.length === 0 ? (
        <p className="text-ink-3 px-2 text-sm"><TranslatedText>
          No one below the podium matches “</TranslatedText>{query.trim()}”.
        </p>
      ) : null}
    </div>
  );
}
