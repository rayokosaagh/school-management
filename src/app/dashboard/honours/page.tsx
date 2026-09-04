import { redirect } from "next/navigation";
import { requirePage } from "@/lib/auth/guard";

/// Honours moved into Students as a view (`?view=honours`) so pupils have one
/// home instead of two. This keeps the old URL working for bookmarks and
/// existing links, guarded the same way the page itself used to be.
export default async function HonoursRedirectPage() {
  await requirePage("/dashboard/honours");
  redirect("/dashboard/students?view=honours");
}
