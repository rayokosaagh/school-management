import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/auth";

/// The site root has no content of its own; send people where they can act.
export default async function RootPage() {
  const session = await auth();
  redirect(session?.user?.id ? "/dashboard" : "/login");
}
