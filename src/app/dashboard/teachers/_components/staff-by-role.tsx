"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { FieldSelect } from "@/components/ui/select";
import { RailNav, type RailItem } from "@/components/ui/rail-nav";
import { Modal } from "@/components/ui/modal";
import { StatusPill } from "@/components/ui/record-table";
import {
  StaffDetail,
  TeacherRowActions,
  type StaffRow,
} from "./teachers-view";

// Grouped by what people do, the way students are grouped by section: one role
// at a time rather than every member of staff in one list.

/// Initials for the badge — "Vice Principal" is too long to sit in a square.
function initials(designation: string) {
  const words = designation.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  return words
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

export function StaffByRole({ rows }: { rows: StaffRow[] }) {
  const groups = useMemo(() => {
    const map = new Map<string, StaffRow[]>();
    for (const row of rows) {
      const key = row.designation.trim() || "Unspecified";
      const list = map.get(key) ?? [];
      list.push(row);
      map.set(key, list);
    }
    // Biggest group first, then alphabetical, so "Teacher" leads.
    return [...map.entries()].sort(
      (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]),
    );
  }, [rows]);

  const items: RailItem[] = groups.map(([designation, people]) => ({
    key: designation,
    badge: initials(designation),
    label: designation,
    count: people.length,
  }));

  const [selected, setSelected] = useState<string | null>(items[0]?.key ?? null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [editing, setEditing] = useState<StaffRow | null>(null);

  const all = useMemo(
    () => groups.find(([designation]) => designation === selected)?.[1] ?? [],
    [groups, selected],
  );

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return all
      .filter((r) =>
        needle === ""
          ? true
          : `${r.fullName} ${r.fullNameNp ?? ""} ${r.phone}`.toLowerCase().includes(needle),
      )
      .filter((r) => (status === "" ? true : status === "active" ? r.isActive : !r.isActive))
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [all, query, status]);

  if (rows.length === 0) return null;

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-[15rem_1fr]">
        <RailNav
          ariaLabel="Roles"
          title="Roles"
          items={items}
          selected={selected}
          onSelect={(key) => {
            setSelected(key);
            setQuery("");
          }}
          hint="The number is how many people hold that role."
        />

        <section className="card-surface flex min-w-0 flex-col p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">{selected}</h2>
              <p className="text-muted-foreground text-sm tabular-nums">
                {all.length} on record · {all.filter((r) => r.isActive).length} active
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <FieldSelect
                aria-label="Status"
                value={status}
                onValueChange={(next) => setStatus(next ?? "")}
                className="w-auto"
                options={[
                  { value: "", label: "All staff" },
                  { value: "active", label: "Active" },
                  { value: "left", label: "Left" },
                ]}
              />
              <div className="relative">
                <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search name or phone"
                  aria-label="Search this role"
                  className="w-48 pl-7"
                />
              </div>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <div className="text-muted-foreground bg-rail mb-2 hidden min-w-[40rem] grid-cols-12 gap-3 rounded-lg px-4 py-2 text-[11px] font-medium tracking-wider uppercase md:grid">
              <div className="col-span-4">Name</div>
              <div className="col-span-2">Phone</div>
              <div className="col-span-3">Teaching</div>
              <div className="col-span-3 text-right">Actions</div>
            </div>

            {shown.length === 0 ? (
              <p className="text-muted-foreground px-1 py-6 text-sm">
                {query || status ? "Nobody matches here." : `No ${selected} on record.`}
              </p>
            ) : (
              <ul className="min-w-[40rem] space-y-1">
                {shown.map((row) => (
                  <li
                    key={row.id}
                    className="bg-rail grid grid-cols-12 items-center gap-3 rounded-xl px-4 py-2"
                  >
                    <div className="col-span-4 min-w-0">
                      <p className="truncate text-sm font-medium">{row.fullName}</p>
                      {row.fullNameNp ? (
                        <p className="text-muted-foreground truncate text-xs">
                          {row.fullNameNp}
                        </p>
                      ) : null}
                    </div>
                    <div className="col-span-2 text-sm tabular-nums">{row.phone}</div>
                    <div className="text-muted-foreground col-span-3 text-sm tabular-nums">
                      {row.sectionsLed} section{row.sectionsLed === 1 ? "" : "s"} ·{" "}
                      {row.assignments} subject{row.assignments === 1 ? "" : "s"}
                    </div>
                    <div className="col-span-3 flex items-center justify-end gap-1">
                      <StatusPill tone={row.isActive ? "positive" : "neutral"}>
                        {row.isActive ? "Active" : "Left"}
                      </StatusPill>
                      <TeacherRowActions row={row} open={() => setEditing(row)} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className="text-muted-foreground mt-3 text-xs tabular-nums">
            Showing {shown.length} of {all.length}
          </p>
        </section>
      </div>

      <Modal
        open={editing !== null}
        title={editing?.fullName ?? ""}
        onClose={() => setEditing(null)}
      >
        {/* Keyed per person: the panel holds its own state, and opening a
            second row must not inherit the first one's. */}
        {editing ? (
          <StaffDetail key={editing.id} row={editing} onDone={() => setEditing(null)} />
        ) : null}
      </Modal>
    </>
  );
}
