import { redirect } from "next/navigation";

/// The detail page moved into the list page's aside. This keeps old bookmarks,
/// printed links and the print page's back-links working by translating the
/// path form into the query form the list page reads.
export default async function StudentRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(/^\d+$/.test(id) ? `/dashboard/students?student=${id}` : "/dashboard/students");
}
