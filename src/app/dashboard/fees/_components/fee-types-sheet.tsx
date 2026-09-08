"use client";

import { TranslatedText } from "@/components/i18n/language-provider";

import { Plus, Settings2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useToastedActionState } from "@/components/ui/toast";
import type { feeWorkspace } from "@/lib/fees/fees";
import { removeFeeHead, toggleFeeHead, type FeeActionState } from "../actions";
import { AddHeadForm } from "./fees-forms";

type FeesData = Awaited<ReturnType<typeof feeWorkspace>>;
const EMPTY: FeeActionState = {};

/// Deleting is offered only while a fee type has never reached a bill. Past
/// that it is disabled rather than hidden, with the reason on it: a school
/// looking for the delete button should be told why it cannot have one.
function HeadDelete({ id, name, billed }: { id: number; name: string; billed: number }) {
  const [, action, pending] = useToastedActionState(removeFeeHead, EMPTY);
  return (
    <form action={action}>
      <input type="hidden" name="headId" value={id} />
      <ConfirmSubmit
        label="Delete"
        confirmLabel="Really delete?"
        pending={pending}
        disabled={billed > 0}
        title={billed > 0
          ? `${name} is on ${billed} bill${billed === 1 ? "" : "s"}, so it cannot be deleted. Stop using it instead.`
          : `Delete ${name} and any prices set for it`}
      />
    </form>
  );
}

function HeadToggle({ id, name, isActive }: { id: number; name: string; isActive: boolean }) {
  const [, action, pending] = useToastedActionState(toggleFeeHead, EMPTY);
  return (
    <form action={action}>
      <input type="hidden" name="headId" value={id} />
      <input type="hidden" name="isActive" value={isActive ? "false" : "true"} />
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        <TranslatedText>{pending ? "Updating…" : isActive ? "Stop using" : "Use again"}</TranslatedText>
        <span className="sr-only"> {name}</span>
      </Button>
    </form>
  );
}

/// Creating, pausing and deleting the school's fee types.
///
/// Lifted out of the Setup body into the page header: it is a setting that
/// governs every step below it, not a step of its own, and the steps read as
/// a sequence once nothing else competes with them for the top of the page.
export function FeeTypesSheet({ managedHeads }: { managedHeads: FeesData["managedHeads"] }) {
  return (
    <Sheet>
      <SheetTrigger render={<Button variant="outline" />}>
        <Settings2 data-icon="inline-start" aria-hidden="true" />
        <span className="hidden sm:inline"><TranslatedText>Manage fee types</TranslatedText></span>
        <span className="sm:hidden"><TranslatedText>Fee types</TranslatedText></span>
      </SheetTrigger>
      <SheetContent className="overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-lg">
        <SheetHeader className="px-6 pt-6">
          <SheetTitle><TranslatedText>Fee types</TranslatedText></SheetTitle>
          <SheetDescription><TranslatedText>Choose class-wide fees or per-student services such as Library. Class fees appear in Class pricing; selected-student fees are configured in Services.</TranslatedText></SheetDescription>
        </SheetHeader>
        <div className="space-y-6 px-6 pb-6">
          <section className="border-line bg-surface-2 rounded-xl border p-4">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold"><Plus className="text-brand size-4" aria-hidden="true" /><TranslatedText>Add a fee type</TranslatedText></h3>
            <AddHeadForm />
          </section>
          <section>
            <h3 className="mb-3 text-sm font-semibold"><TranslatedText>Your fee types </TranslatedText><span className="text-ink-3 font-normal">({managedHeads.length})</span></h3>
            {managedHeads.length ? <ul className="divide-line divide-y">{managedHeads.map(head => (
              <li key={head.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                <Badge variant="outline"><TranslatedText>{head.billingScope === "STUDENT" ? "Per-student service" : "Class-wide"}</TranslatedText></Badge>
                <div className="min-w-0"><p className="break-words text-sm font-medium">{head.name}</p><p className="text-ink-3 mt-1 text-xs"><TranslatedText>{head.frequency === "MONTHLY" ? "Every month" : "Once a year"}</TranslatedText> · <TranslatedText>{head.isActive ? "In use" : "Not in use"}</TranslatedText><TranslatedText>{head._count.invoiceLines > 0 ? ` · on ${head._count.invoiceLines} bill${head._count.invoiceLines === 1 ? "" : "s"}` : head._count.structureLines > 0 ? ` · priced in ${head._count.structureLines} ${head._count.structureLines === 1 ? "class" : "classes"}` : " · never used"}</TranslatedText></p></div>
                <div className="flex flex-wrap items-center gap-2">
                  <HeadToggle id={head.id} name={head.name} isActive={head.isActive} />
                  <HeadDelete id={head.id} name={head.name} billed={head._count.invoiceLines} />
                </div>
              </li>
            ))}</ul> : <p className="text-ink-3 text-sm leading-6"><TranslatedText>No fee types yet. Add your first one above to start setting class amounts.</TranslatedText></p>}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
