"use client";

import { Check, ChevronDown, Megaphone, Pin, Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import { useToastedActionState } from "@/components/ui/toast";
import type { AnnouncementCard } from "@/lib/announcements/announcements";
import { AUDIENCE_LABEL } from "@/lib/announcements/visibility";
import { formatBs } from "@/lib/date/bs";
import { cn, focusRing } from "@/lib/utils";
import { TranslatedText, useLanguage } from "@/components/i18n/language-provider";
import {
  readAllAnnouncements, readAnnouncement, type AnnouncementState,
} from "../actions";
import { AnnouncementForm, ComposeHeading, ManageAnnouncements } from "./announcement-forms";

const EMPTY: AnnouncementState = {};

/// Acknowledging a notice is its own submit rather than something expanding it
/// does quietly. A glance at a title is not the same as having read the thing,
/// and an unread count that empties itself as you scroll past is worth nothing
/// to the person who wrote the notice.
function MarkRead({ item }: { item: AnnouncementCard }) {
  const [, action, pending] = useToastedActionState(readAnnouncement, EMPTY);
  return (
    <form action={action}>
      <input type="hidden" name="announcementId" value={item.id} />
      <Button type="submit" variant="outline" size="xs" disabled={pending}>
        <Check data-icon="inline-start" aria-hidden="true" />
        <TranslatedText>{pending ? "Marking…" : "Mark as read"}</TranslatedText>
        <span className="sr-only"> — {item.title}</span>
      </Button>
    </form>
  );
}

function MarkAllRead({ count }: { count: number }) {
  const [, action, pending] = useToastedActionState(readAllAnnouncements, EMPTY);
  return (
    <form action={action}>
      <Button type="submit" variant="ghost" size="xs" disabled={pending}>
        <TranslatedText>{pending ? "Marking…" : `Mark all ${count} as read`}</TranslatedText>
      </Button>
    </form>
  );
}

function Notice({ item }: { item: AnnouncementCard }) {
  const [open, setOpen] = useState(false);
  return (
    <li
      className={cn(
        "border-line rounded-lg border p-3.5",
        item.read ? "bg-surface" : "bg-brand-tint/40 border-brand-tint-2",
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        className={cn("flex w-full items-start gap-3 rounded text-left", focusRing)}
      >
        {/* Unread is a dot as well as a fill, so it survives greyscale and a
            reader who cannot pick the tint out of the background. */}
        <span
          className={cn(
            "mt-1.5 size-2 shrink-0 rounded-full",
            item.read ? "bg-line-strong" : "bg-brand",
          )}
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            {item.isPinned ? <Pin className="text-brand size-3.5 shrink-0" aria-hidden="true" /> : null}
            <span className={cn("break-words text-sm", item.read ? "font-medium" : "font-semibold")}>
              {item.title}
            </span>
            {item.read ? null : <span className="sr-only"><TranslatedText>(unread)</TranslatedText></span>}
          </span>
          <span className="text-ink-3 mt-1 block text-xs">
            {AUDIENCE_LABEL[item.audience]} · {formatBs(item.createdAt, "DD MMM YYYY")}
            <TranslatedText>{item.author ? ` · ${item.author}` : ""}</TranslatedText>
          </span>
        </span>
        <ChevronDown
          className={cn("text-ink-3 mt-0.5 size-4 shrink-0 transition-transform", open && "rotate-180")}
          aria-hidden="true"
        />
      </button>
      {open ? (
        <div className="border-line mt-3 border-t pt-3">
          <p className="text-ink-2 text-sm leading-6 whitespace-pre-wrap">{item.body}</p>
          {item.expiresOn ? (
            <p className="text-ink-3 mt-3 text-xs"><TranslatedText>
              Shows until </TranslatedText>{formatBs(item.expiresOn, "DD MMMM YYYY")}
            </p>
          ) : null}
          {item.read ? null : (
            <div className="mt-3">
              <MarkRead item={item} />
            </div>
          )}
        </div>
      ) : null}
    </li>
  );
}

/// What the office wants staff to know, on the dashboard they already open.
///
/// Sits above roll call because a notice is the one thing here that nobody can
/// discover any other way: every other panel restates something a page
/// elsewhere would tell you.
export function AnnouncementsPanel({
  items,
  manageable,
  canPost,
}: {
  items: AnnouncementCard[];
  /// Every notice, expired ones included, for the sheet. Empty for a reader
  /// who cannot post, who is never shown the sheet.
  manageable: AnnouncementCard[];
  canPost: boolean;
}) {
  const { t } = useLanguage();
  const unread = items.filter((item) => !item.read).length;

  // Nothing to read and nothing this reader could do about it.
  if (items.length === 0 && !canPost) return null;

  return (
    <section className="bg-surface border-line min-w-0 rounded-xl border p-5">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            {t("Announcements")}
            {unread > 0 ? (
              <span className="bg-brand text-brand-ink rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums">
                {unread} {t("new")}
              </span>
            ) : null}
          </h2>
          <p className="text-ink-3 mt-1 text-xs leading-5">
            {items.length === 0
              ? t("Nothing posted yet.")
              : unread > 0
                ? t("Messages for you and your role.")
                : t("You are up to date.")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {unread > 1 ? <MarkAllRead count={unread} /> : null}
          {canPost ? (
            <Sheet>
              <SheetTrigger render={<Button variant="outline" size="sm" />}>
                <Plus data-icon="inline-start" aria-hidden="true" /><TranslatedText>
                New announcement
              </TranslatedText></SheetTrigger>
              <SheetContent className="overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-lg">
                <SheetHeader className="px-6 pt-6">
                  <SheetTitle><TranslatedText>Announcements</TranslatedText></SheetTitle>
                  <SheetDescription><TranslatedText>
                    Write a notice for staff to read on their own dashboard. Choose who it is for;
                    only the roles you pick will see it.
                  </TranslatedText></SheetDescription>
                </SheetHeader>
                <div className="space-y-6 px-6 pb-6">
                  <section className="border-line bg-surface-2 rounded-xl border p-4">
                    <ComposeHeading />
                    <AnnouncementForm />
                  </section>
                  <section>
                    <h3 className="mb-3 text-sm font-semibold">
                      {t("Posted")}<TranslatedText>{" "}</TranslatedText>
                      <span className="text-ink-3 font-normal">({manageable.length})</span>
                    </h3>
                    <ManageAnnouncements items={manageable} />
                  </section>
                </div>
              </SheetContent>
            </Sheet>
          ) : null}
        </div>
      </div>

      {items.length === 0 ? (
        <div className="bg-surface-2 rounded-lg px-4 py-6 text-center">
          <Megaphone className="text-brand mx-auto mb-3 size-6" aria-hidden="true" />
          <p className="text-sm font-medium">{t("No announcements yet")}</p>
          <p className="text-ink-3 mx-auto mt-1 max-w-sm text-xs leading-5">
            {t("Post one to tell staff about exam week, a holiday, or a deadline.")}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <Notice key={item.id} item={item} />
          ))}
        </ul>
      )}
    </section>
  );
}
