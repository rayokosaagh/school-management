import { redirect } from "next/navigation";

/// The detail page moved into the list page's aside. This keeps old bookmarks
/// and printed links working by translating the path form into the query form
/// the list page reads.
export default async function StaffRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(/^\d+$/.test(id) ? `/dashboard/teachers?staff=${id}` : "/dashboard/teachers");
}
