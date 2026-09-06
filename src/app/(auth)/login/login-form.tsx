"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { ArrowRight, AtSign, Eye, EyeOff, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/ui/login-signup";

export function LoginForm({
  schoolName,
  schoolLogoId,
}: {
  schoolName: string | null;
  schoolLogoId: number | null;
}) {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [isVisible, setIsVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const toggleVisibility = () => setIsVisible((prev) => !prev);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);

    const result = await signIn("credentials", {
      identifier,
      password,
      redirect: false,
    });

    setPending(false);

    if (!result || result.error) {
      // One message for both failure modes. Naming which half was wrong would
      // hand back the account list the timing fix in auth.ts removed.
      setError("Incorrect username or password.");
      return;
    }

    router.push("/dashboard");
    // The session cookie is new, so already-rendered server components still
    // hold the signed-out render. refresh() re-fetches them with the cookie.
    router.refresh();
  }

  return (
    <div className="flex items-center justify-center min-h-screen px-4">
      <div className="mx-auto w-full max-w-xs space-y-6">
        <div className="space-y-2 text-center">
          {schoolLogoId ? (
            // The route exposes only the school's public identity image. The
            // id changes whenever an admin replaces it, so cached old logos
            // are never requested after Settings is saved.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/school-logo?v=${schoolLogoId}`}
              alt={schoolName ? `${schoolName} logo` : "School logo"}
              className="mx-auto h-28 w-28 rounded-2xl object-contain"
            />
          ) : (
            <Logo className="mx-auto h-28 w-28" />
          )}
          <h1 className="text-3xl font-semibold">{schoolName ?? "Welcome back"}</h1>
          <p className="text-muted-foreground">
            Sign in to access students, teachers and classes.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-6">
            <div>
              <Label htmlFor="identifier">Username or email</Label>
              <div className="relative mt-2.5">
                <Input
                  id="identifier"
                  name="identifier"
                  className="peer ps-9"
                  placeholder="Enter your username or email"
                  // "username" is the right token even though this field also
                  // takes an email — it is what password managers match on for
                  // a combined identifier field.
                  autoComplete="username"
                  autoFocus
                  required
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                />
                <div className="text-muted-foreground/80 pointer-events-none absolute inset-y-0 start-0 flex items-center justify-center ps-3 peer-disabled:opacity-50">
                  <AtSign size={16} aria-hidden="true" />
                </div>
              </div>
            </div>

            <div>
              <Label htmlFor="password">Password</Label>
              <div className="relative mt-2.5">
                <Input
                  id="password"
                  name="password"
                  className="ps-9 pe-9"
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  required
                  type={isVisible ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <div className="text-muted-foreground/80 pointer-events-none absolute inset-y-0 start-0 flex items-center justify-center ps-3 peer-disabled:opacity-50">
                  <Lock size={16} aria-hidden="true" />
                </div>
                <button
                  className="text-muted-foreground/80 hover:text-foreground focus-visible:border-ring focus-visible:ring-ring/50 absolute inset-y-0 end-0 flex h-full w-9 items-center justify-center rounded-e-md transition-[color,box-shadow] outline-none focus:z-10 focus-visible:ring-[3px] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
                  type="button"
                  onClick={toggleVisibility}
                  aria-label={isVisible ? "Hide password" : "Show password"}
                  aria-pressed={isVisible}
                  aria-controls="password"
                >
                  {isVisible ? (
                    <EyeOff size={16} aria-hidden="true" />
                  ) : (
                    <Eye size={16} aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>
          </div>

          {error && (
            <p
              role="alert"
              className="text-destructive text-sm text-center"
            >
              {error}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Signing in…" : "Sign in"}
            {!pending && <ArrowRight className="h-4 w-4" />}
          </Button>

        </form>
      </div>
    </div>
  );
}
