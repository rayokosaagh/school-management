"use client";

import { TranslatedText } from "@/components/i18n/language-provider";

import { BookOpen, CalendarCheck, CalendarDays, Check, ChevronRight, Coins, Copy, Pencil, Search, Trash2 } from "lucide-react";
import { useId, useState } from "react";
import { StatusDot } from "@/components/ui/status-dot";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldSelect } from "@/components/ui/select";
import { useToastedActionState } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import type { feeWorkspace } from "@/lib/fees/fees";
import { money } from "@/lib/fees/money";
import { saveFeeMatrix, type FeeActionState } from "../actions";
import { SetupHeader } from "./setup-header";

type FeesData = Awaited<ReturnType<typeof feeWorkspace>>;
type Draft = { seed: string; value: string };
const EMPTY: FeeActionState = {};
const cellKey = (gradeId: number, headId: number) => `${gradeId}-${headId}`;

// Drafts survive class switches. Only the selected class is submitted, and
// refreshed server prices invalidate only drafts based on an older value.
export function FeeMatrix({ academicYearId, yearLabel, grades, heads, structures }: Pick<FeesData, "grades" | "heads" | "structures"> & {
  academicYearId: number; yearLabel: string;
}) {
  const [state, action, pending] = useToastedActionState(saveFeeMatrix, EMPTY);
  const [selectedId, setSelectedId] = useState(grades[0]?.id ?? 0);
  const [query, setQuery] = useState("");
  const [copyFrom, setCopyFrom] = useState("");
  const [draft, setDraft] = useState<Record<string, Draft>>({});
  const id = useId();
  // Class pricing owns class-scoped fees and nothing else. Transport lives in
  // its own tab and student fees in theirs, and the hidden inputs below post
  // every one of these — so an active TRANSPORT head reaching this list made
  // setFeeAmounts reject the whole save ("Transport prices belong in the
  // student transport register"), whatever the clerk had actually typed.
  const active = heads.filter(head => head.isActive && head.billingScope === "CLASS");
  const selected = grades.find(grade => grade.id === selectedId) ?? grades[0];
  const saved = new Map<string, string>();
  for (const plan of structures) {
    for (const line of plan.lines) saved.set(cellKey(plan.grade.id, line.feeHeadId), String(line.amount));
  }
  const savedAt = (key: string) => saved.get(key) ?? "";
  const shown = (key: string) => draft[key]?.seed === savedAt(key) ? draft[key].value : savedAt(key);
  const changes = (gradeId: number) => active.filter(head => shown(cellKey(gradeId, head.id)) !== savedAt(cellKey(gradeId, head.id))).length;
  function edit(key: string, value: string) {
    setDraft(previous => ({ ...previous, [key]: { seed: savedAt(key), value } }));
  }
  function choose(gradeId: number) { setSelectedId(gradeId); setCopyFrom(""); }
  if (!selected) return <p className="text-ink-3 p-6 text-sm"><TranslatedText>Add a class before setting its prices.</TranslatedText></p>;
  const gradeId = selected.id;
  const changed = changes(gradeId);
  // Every class fee is always on screen, blank meaning "not charged" — what an
  // empty cell has always meant here.
  //
  // Showing only the fees that already had an amount, and putting the rest
  // behind an "Add a fee" select below the fold, meant a fee you had not set
  // yet was invisible. A class with an admission fee and no monthly one
  // rendered "No monthly charges added" and no field, so the answer to "why
  // can't I set the monthly fee" was that there was nowhere to type it. The
  // select could not fix that: you have to know a fee is missing before you
  // go looking for the control that adds it.
  const visible = active;
  const bands = [
    { label: "Admission & yearly", note: "Charged once in this academic year", monthly: false },
    { label: "Monthly fees", note: "Charged each month when bills are issued", monthly: true },
  ];
  const total = (monthly: boolean) => active.filter(head => (head.frequency === "MONTHLY") === monthly).reduce((sum, head) => {
    const amount = Number(shown(cellKey(gradeId, head.id)));
    return sum + (Number.isFinite(amount) && amount > 0 ? amount : 0);
  }, 0);
  const otherDrafts = grades.filter(grade => grade.id !== gradeId && changes(grade.id) > 0).length;
  const matches = grades.filter(grade => grade.name.toLowerCase().includes(query.trim().toLowerCase()));
  function discard() {
    setDraft(previous => Object.fromEntries(Object.entries(previous).filter(([key]) => !key.startsWith(`${gradeId}-`))));
  }
  function copyPrices() {
    if (!copyFrom) return;
    const next = { ...draft };
    for (const head of active) {
      const key = cellKey(gradeId, head.id);
      next[key] = { seed: savedAt(key), value: savedAt(cellKey(Number(copyFrom), head.id)) };
    }
    setDraft(next);
  }

  return (
    // One card, rail attached down its left edge — the same shape the Services
    // step uses, so the two steps of setup are laid out identically.
    <div className="grid min-w-0 lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="border-line bg-surface-2/50 min-w-0 rounded-t-xl border-b p-4 lg:rounded-tr-none lg:rounded-bl-xl lg:border-r lg:border-b-0 lg:p-5">
        <div className="mb-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span aria-hidden="true" className="bg-brand-tint text-brand-text grid size-8 shrink-0 place-items-center rounded-lg"><BookOpen className="size-4" /></span>
            <h3 className="text-sm font-semibold"><TranslatedText>Classes</TranslatedText></h3>
          </div>
          <span className="text-ink-3 text-xs">{grades.length}<TranslatedText> classes</TranslatedText></span>
        </div>
        <div className="lg:hidden"><FieldSelect aria-label="Class to price" value={String(gradeId)} onValueChange={value => choose(Number(value))} disabled={pending} options={grades.map(grade => ({ value: String(grade.id), label: `${grade.name}${changes(grade.id) ? " · Unsaved" : ""}` }))} /></div>
        <div className="hidden lg:block">
          <div className="relative mb-4"><Search className="text-ink-3 pointer-events-none absolute top-3 left-3 size-4" aria-hidden="true" /><Input aria-label="Search classes" value={query} onChange={event => setQuery(event.target.value)} placeholder="Find a class…" className="pl-9" /></div>
          <nav aria-label="Class pricing" className="max-h-[65vh] space-y-1 overflow-y-auto">
            {matches.map(grade => {
              const configured = active.some(head => savedAt(cellKey(grade.id, head.id)) !== "");
              const count = changes(grade.id);
              return <button key={grade.id} type="button" disabled={pending} onClick={() => choose(grade.id)} aria-current={gradeId === grade.id ? "true" : undefined} className={cn("focus-visible:ring-brand flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-60", gradeId === grade.id ? "bg-brand-tint text-brand-text shadow-[inset_3px_0_0_var(--brand)]" : "hover:bg-surface-2 text-ink-2")}>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{grade.name}</span>
                  {/* A dot for the state and a word for what it means. "Needs
                      pricing" scanned as prose in a list of twelve; the colour
                      is what the eye is actually looking for. */}
                  <StatusDot tone={count ? "bad" : configured ? "ok" : "warn"} className="mt-1 text-xs">
                    <TranslatedText>{count ? `${count} unsaved ${count === 1 ? "change" : "changes"}` : configured ? "Configured" : "Needs pricing"}</TranslatedText>
                  </StatusDot>
                </span>
                <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
              </button>;
            })}
            {!matches.length ? <p className="text-ink-3 px-3 py-5 text-sm"><TranslatedText>No matching classes.</TranslatedText></p> : null}
          </nav>
        </div>
      </aside>

      <form action={action} className="min-w-0" aria-label={`Pricing for ${selected.name}`}>
        <input type="hidden" name="academicYearId" value={academicYearId} />
        {/* Empty values remove charges. Other classes never enter this post. */}
        {active.map(head => <input key={head.id} type="hidden" name={`amount-${gradeId}-${head.id}`} value={shown(cellKey(gradeId, head.id))} />)}
        <fieldset disabled={pending} className="min-w-0">
          {/* The same header the services use, so the two setup steps read as
              one screen with different contents. */}
          {/* No badge beside the class name: the rail already carries every
              class's state, including this one's, and saying it twice on one
              screen only invites the two to disagree. */}
          <SetupHeader
            icon={Coins}
            eyebrow={`Class pricing · ${yearLabel}`}
            title={selected.name}
            description="Set what one pupil pays. These prices apply to new bills only."
            stats={[
              { icon: CalendarCheck, label: "Admission & yearly", value: money(total(false)), note: "per pupil / year" },
              { icon: CalendarDays, label: "Monthly fees", value: money(total(true)), note: "per pupil / month" },
            ]}
          />
          <div className="space-y-7 p-5 sm:p-7">
            {grades.length > 1 && active.length > 0 ? <details className="border-line rounded-lg border border-dashed p-4">
              <summary className="text-ink-2 cursor-pointer text-sm font-medium"><TranslatedText>Copy saved prices from another class</TranslatedText></summary>
              <Label htmlFor={`${id}-copy`} className="sr-only"><TranslatedText>Use another class’s saved prices</TranslatedText></Label>
              <div className="mt-2 flex flex-wrap gap-2"><FieldSelect id={`${id}-copy`} aria-label="Copy prices from" value={copyFrom} onValueChange={value => setCopyFrom(value ?? "")} disabled={pending} className="min-w-0 flex-1 basis-40" options={[{ value: "", label: "Choose a class" }, ...grades.filter(grade => grade.id !== gradeId).map(grade => ({ value: String(grade.id), label: grade.name }))]} /><Button type="button" variant="outline" disabled={!copyFrom || pending} onClick={copyPrices}><Copy data-icon="inline-start" /><TranslatedText>Copy prices</TranslatedText></Button></div>
              <p className="text-ink-3 mt-2 text-xs leading-5"><TranslatedText>Replaces this class’s draft, including cleared fees. Review before saving.</TranslatedText></p>
            </details> : null}
            {bands.map(band => <section key={band.label} aria-label={band.label}>
              <div className="mb-4"><h4 className="text-sm font-semibold">{band.label}</h4><p className="text-ink-3 mt-1 text-xs">{band.note}</p></div>
              <div className="space-y-3">{visible.filter(head => (head.frequency === "MONTHLY") === band.monthly).map(head => {
                const key = cellKey(gradeId, head.id);
                return <div key={key} className="border-line flex flex-wrap items-center gap-3 rounded-lg border p-4">
                  <Label htmlFor={`${id}-${key}`} className="min-w-0 flex-1 basis-32 break-words">{head.name}</Label>
                  <div className="flex min-w-0 flex-1 basis-44 items-center gap-2"><span className="text-ink-3 text-sm"><TranslatedText>Rs.</TranslatedText></span><Input id={`${id}-${key}`} aria-label={`${head.name} for ${selected.name}`} value={shown(key)} onChange={event => edit(key, event.target.value)} type="number" min={1} max={2147483647} step={1} inputMode="numeric" placeholder="Amount" className={cn("min-w-0 text-right tabular-nums", shown(key) !== savedAt(key) && "border-brand bg-brand-tint/30")} /><Button type="button" variant="ghost" size="icon" aria-label={`Clear ${head.name} for ${selected.name}`} onClick={() => edit(key, "")}><Trash2 className="size-4" /></Button></div>
                </div>;
              })}</div>
              {!visible.some(head => (head.frequency === "MONTHLY") === band.monthly) ? <p className="text-ink-3 bg-surface-2/60 rounded-lg px-4 py-5 text-sm"><TranslatedText>No </TranslatedText><TranslatedText>{band.monthly ? "monthly" : "admission or yearly"}</TranslatedText><TranslatedText> fee types exist yet.</TranslatedText></p> : null}
            </section>)}
            <p className="text-ink-3 text-xs leading-5"><TranslatedText>Leave a fee blank, or clear it, to stop charging this class. Existing bills stay unchanged. Add new fee types in Manage fee types; transportation and per-student charges are in Services.</TranslatedText></p>
          </div>
        </fieldset>
        <footer className="bg-surface border-line sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-4 rounded-b-xl border-t p-5 sm:px-7">
          {/* The mark carries the state at a glance: settled when there is
              nothing to save, waiting when there is. */}
          <div role="status" className="flex items-center gap-2.5">
            <span aria-hidden="true" className={cn("grid size-7 shrink-0 place-items-center rounded-full", changed ? "bg-warn-tint text-warn" : "bg-tint-green text-tint-green-fg")}>
              {changed ? <Pencil className="size-3.5" /> : <Check className="size-4" />}
            </span>
            <div>
              <p className="text-sm font-medium"><TranslatedText>{pending ? "Saving class prices…" : changed ? `${changed} unsaved ${changed === 1 ? "change" : "changes"}` : "No unsaved changes"}</TranslatedText></p>
              <p className="text-ink-3 mt-0.5 text-xs"><TranslatedText>{otherDrafts ? `Drafts in ${otherDrafts} other ${otherDrafts === 1 ? "class are" : "classes are"} kept separately.` : "Only this class will be saved."}</TranslatedText></p>
            </div>
          </div>
          <div className="flex w-full gap-2 sm:w-auto"><Button type="button" variant="outline" onClick={discard} disabled={pending || !changed}><TranslatedText>Discard</TranslatedText></Button><Button type="submit" disabled={pending || !changed} className="flex-1 sm:flex-none"><Check data-icon="inline-start" /><TranslatedText>{pending ? "Saving…" : "Save class pricing"}</TranslatedText></Button></div>
          {state.error ? <p role="alert" className="text-bad w-full text-sm">{state.error}</p> : null}
        </footer>
      </form>
    </div>
  );
}
