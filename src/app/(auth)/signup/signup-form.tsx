"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { ArrowRight, AtSign, Eye, EyeOff, Lock, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/ui/login-signup";
import { createUser, type SignupState } from "./actions";

const INITIAL: SignupState = {};

export function SignupForm() {
  // useActionState keeps the action server-side while giving the form back a
  // return value to render and a pending flag — the reason this component is
  // "use client" while createUser still runs on the server. Login hand-rolls
  // the same two pieces with useState because signIn() is a client call.
  const [state, formAction, pending] = useActionState(createUser, INITIAL);
  const [isVisible, setIsVisible] = useState(false);

  const toggleVisibility = () => setIsVisible((prev) => !prev);

  return (
    <div className="flex items-center justify-center min-h-screen px-4">
      <div className="mx-auto w-full max-w-xs space-y-6">
        <div className="space-y-2 text-center">
          <Logo className="mx-auto h-16 w-16" />
          <h1 className="text-3xl font-semibold">Create an account</h1>
          <p className="text-muted-foreground">
            Get set up to manage students, teachers and classes.
          </p>
        </div>

        <form action={formAction} className="space-y-5">
          <div className="space-y-6">
            <div>
              <Label htmlFor="username">Username</Label>
              <div className="relative mt-2.5">
                <Input
                  id="username"
                  name="username"
                  className="peer ps-9"
                  placeholder="Choose a username"
                  autoComplete="username"
                  autoFocus
                  minLength={3}
                  required
                />
                <div className="text-muted-foreground/80 pointer-events-none absolute inset-y-0 start-0 flex items-center justify-center ps-3 peer-disabled:opacity-50">
                  <User size={16} aria-hidden="true" />
                </div>
              </div>
            </div>

            <div>
              <Label htmlFor="email">Email</Label>
              <div className="relative mt-2.5">
                <Input
                  id="email"
                  name="email"
                  type="email"
                  className="peer ps-9"
                  placeholder="Enter your email"
                  autoComplete="email"
                  required
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
                  placeholder="Create a password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                  type={isVisible ? "text" : "password"}
                  aria-describedby="password-hint"
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
              <p
                id="password-hint"
                className="text-muted-foreground mt-2 text-xs"
              >
                At least 8 characters.
              </p>
            </div>
          </div>

          {state.error && (
            <p role="alert" className="text-destructive text-sm text-center">
              {state.error}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Creating account…" : "Create account"}
            {!pending && <ArrowRight className="h-4 w-4" />}
          </Button>

          <div className="text-center text-sm">
            Already have an account?{" "}
            <Link
              href="/login"
              className="text-primary font-medium hover:underline"
            >
              Sign in
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
