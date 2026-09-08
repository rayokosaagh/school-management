"use client";

import { TranslatedText } from "@/components/i18n/language-provider";

import { Megaphone, Pin, Plus, Trash2 } from "lucide-react";
import { useId, useState } from "react";
import type { AnnouncementAudience } from "@/generated/prisma/enums";
import { Button } from "@/components/ui/button";
import { BsDateField } from "@/components/ui/bs-date-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldSelect } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToastedActionState } from "@/components/ui/toast";
import type { AnnouncementCard } from "@/lib/announcements/announcements";
import { AUDIENCE_LABEL, AUDIENCE_NOTE } from "@/lib/announcements/visibility";
import { formatBs } from "@/lib/date/bs";
import {
  editAnnouncement,
  postAnnouncement,
  withdrawAnnouncement,
  type AnnouncementState,
} from "../actions";

const EMPTY: AnnouncementState = {};

const AUDIENCES: AnnouncementAudience[] = ["ALL", "TEACHER", "OFFICE"];

/// Clears the compose form once the server confirms the write, by remounting
/// it. The id of the notice just posted changes on every success, where the
/// message text alone would repeat and leave a second post looking like the
/// first.
function resetKey(state: AnnouncementState) {
  return state.success ? (state.token ?? -1) : "draft";
}

/// Write a notice, or correct one already posted.
///
/// One form for both: an edit that could not set the same fields as a post
/// would quietly be a different feature, and the school would learn which
/// mistakes are fixable by making them.
export function AnnouncementForm({
  existing,
  onDone,
}: {
  existing?: AnnouncementCard;
  onDone?: () => void;
}) {
  const [state, action, pending] = useToastedActionState(
    existing ? editAnnouncement : postAnnouncement,
    EMPTY,
  );
  const id = useId();
  const [audience, setAudience] = useState<AnnouncementAudience>(existing?.audience ?? "ALL");

  return (
    <form
      key={existing ? existing.id : resetKey(state)}
      action={(data) => {
        action(data);
        onDone?.();
      }}
      className="space-y-4"
    >
      {existing ? <input type="hidden" name="announcementId" value={existing.id} /> : null}

      <div className="space-y-2">
        <Label htmlFor={`${id}-title`}><TranslatedText>Title</TranslatedText></Label>
        <Input
          id={`${id}-title`}
          name="title"
          defaultValue={existing?.title}
          placeholder="Exam week starts Monday"
          maxLength={120}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${id}-body`}><TranslatedText>Message</TranslatedText></Label>
        <Textarea
          id={`${id}-body`}
          name="body"
          defaultValue={existing?.body}
          placeholder="What do staff need to know, and by when?"
          maxLength={2000}
          rows={5}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${id}-audience`}><TranslatedText>Who is it for?</TranslatedText></Label>
        {/* React posts the value, so the picker cannot drift out of step with
            what is submitted the way an uncontrolled select would. */}
        <input type="hidden" name="audience" value={audience} />
        <FieldSelect
          id={`${id}-audience`}
          value={audience}
          onValueChange={(next) => setAudience((next as AnnouncementAudience) ?? "ALL")}
          options={AUDIENCES.map((value) => ({ value, label: AUDIENCE_LABEL[value] }))}
          className="w-full"
        />
        <p className="text-ink-3 text-xs leading-5">{AUDIENCE_NOTE[audience]}</p>
      </div>

      <div className="space-y-2">
        <BsDateField
          id={`${id}-expires`}
          name="expiresOn"
          label="Stop showing after"
          defaultValue={existing?.expiresOn ? formatBs(existing.expiresOn, "YYYY-MM-DD") : ""}
          help="Leave blank to keep it up until you withdraw it"
        />
      </div>

      <label className="border-line bg-surface-2 flex items-start gap-3 rounded-lg border p-3">
        <input
          type="checkbox"
          name="isPinned"
          defaultChecked={existing?.isPinned}
          className="accent-brand mt-0.5 size-4 shrink-0"
        />
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 text-sm font-medium">
            <Pin className="size-3.5" aria-hidden="true" /><TranslatedText>
            Keep it at the top
          </TranslatedText></span>
          <span className="text-ink-3 mt-1 block text-xs leading-5"><TranslatedText>
            For the few notices that stay true all year, such as exam week or the fee deadline.
          </TranslatedText></span>
        </span>
      </label>

      <Button type="submit" disabled={pending} className="w-full">
        {existing ? null : <Plus data-icon="inline-start" aria-hidden="true" />}
        <TranslatedText>{pending
          ? existing
            ? "Saving…"
            : "Posting…"
          : existing
            ? "Save changes"
            : "Post announcement"}</TranslatedText>
      </Button>
    </form>
  );
}

function Withdraw({ item }: { item: AnnouncementCard }) {
  const [, action, pending] = useToastedActionState(withdrawAnnouncement, EMPTY);
  return (
    <form action={action}>
      <input type="hidden" name="announcementId" value={item.id} />
      <Button
        type="submit"
        variant="ghost"
        size="icon-sm"
        disabled={pending}
        aria-label={`Withdraw ${item.title}`}
      >
        <Trash2 aria-hidden="true" />
      </Button>
    </form>
  );
}

/// Everything posted, current or expired, for the people who may change it.
export function ManageAnnouncements({ items }: { items: AnnouncementCard[] }) {
  const [editing, setEditing] = useState<number | null>(null);

  if (items.length === 0) {
    return (
      <p className="text-ink-3 text-sm leading-6"><TranslatedText>
        Nothing posted yet. Your first announcement appears on every dashboard it is addressed to.
      </TranslatedText></p>
    );
  }

  return (
    <ul className="divide-line divide-y">
      {items.map((item) => (
        <li key={item.id} className="py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                {item.isPinned ? <Pin className="text-brand size-3.5" aria-hidden="true" /> : null}
                <span className="break-words">{item.title}</span>
              </p>
              <p className="text-ink-3 mt-1 text-xs">
                {AUDIENCE_LABEL[item.audience]} · {formatBs(item.createdAt, "DD MMM YYYY")}
                <TranslatedText>{item.expiresOn ? ` · until ${formatBs(item.expiresOn, "DD MMM YYYY")}` : ""}</TranslatedText>
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="xs"
                aria-expanded={editing === item.id}
                onClick={() => setEditing((open) => (open === item.id ? null : item.id))}
              >
                <TranslatedText>{editing === item.id ? "Close" : "Edit"}</TranslatedText>
              </Button>
              <Withdraw item={item} />
            </div>
          </div>
          {editing === item.id ? (
            <div className="border-line mt-4 border-t pt-4">
              <AnnouncementForm existing={item} onDone={() => setEditing(null)} />
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function ComposeHeading() {
  return (
    <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold">
      <Megaphone className="text-brand size-4" aria-hidden="true" /><TranslatedText>
      Write an announcement
    </TranslatedText></h3>
  );
}
