import { redirect } from "next/navigation";
import { requirePage } from "@/lib/auth/guard";

/// Timetable moved into Classes as a view (`?view=timetable`) so it sits next
/// to Structure and Years rather than as its own rail entry. This keeps the
/// old URL working for bookmarks and existing links, preserving the params
/// that name a class, a teacher or a day shape.
///
/// requirePage("/dashboard/timetable") now only requires a session —
/// /dashboard/timetable carries no capability in ROUTE_CAPABILITY, on
/// purpose: the real, per-view check (manage:timetable for the full grid, or
/// a teacher's own read-only week) happens once, on the page this redirects
/// to, rather than being duplicated — and risking disagreement — here.
export default async function TimetableRedirectPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string; teacher?: string; shape?: string }>;
}) {
  await requirePage("/dashboard/timetable");

  const { section, teacher, shape } = await searchParams;
  const query = new URLSearchParams({ view: "timetable" });
  if (section) query.set("section", section);
  if (teacher) query.set("teacher", teacher);
  if (shape) query.set("shape", shape);

  redirect(`/dashboard/classes?${query.toString()}`);
}
