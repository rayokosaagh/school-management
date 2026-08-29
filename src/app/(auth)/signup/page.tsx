import Link from "next/link";
import { Lock } from "lucide-react";
import { Logo } from "@/components/ui/login-signup";
import { isSignupOpen } from "@/lib/auth/registration";
import { getLetterhead } from "@/lib/registry/school";
import { SignupForm } from "./signup-form";

// Rendered per request: whether sign-up is open depends on the database, and a
// prerendered page would freeze that answer at build time.
export const dynamic = "force-dynamic";

export default async function SignupPage() {
  const [open, school] = await Promise.all([isSignupOpen(), getLetterhead()]);

  if (open) return <SignupForm />;

  // The form is hidden once the first account exists. The action refuses too —
  // this is only so nobody fills in a form that was always going to be rejected.
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="mx-auto w-full max-w-sm space-y-6 text-center">
        <Logo className="mx-auto h-16 w-16" />
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">
            {school.configured ? school.name : "School Management"}
          </h1>
          <p className="text-muted-foreground">
            Sign-up is closed.
          </p>
        </div>

        <div className="bg-tint-amber text-tint-amber-fg flex items-start gap-2.5 rounded-xl px-4 py-3 text-left text-sm">
          <Lock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p>
            This system holds student records, so accounts are not self-served.
            Ask someone who already has one to add you from{" "}
            <span className="font-medium">Settings</span>.
          </p>
        </div>

        <Link href="/login" className="inline-block text-sm underline">
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
