import { getLetterhead } from "@/lib/registry/school";
import { LoginForm } from "./login-form";

// Rendered per request: prerendering would bake in whatever the school was
// called at build time and never pick up a rename in Settings.
export const dynamic = "force-dynamic";

// A server shell so the school's own name greets people at sign-in, rather than
// a generic heading. The name is on every printed marksheet anyway, so showing
// it before authentication gives nothing away.
export default async function LoginPage() {
  const school = await getLetterhead();
  return <LoginForm schoolName={school.configured ? school.name : null} />;
}
