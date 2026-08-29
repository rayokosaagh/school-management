"use server";

import { redirect } from "next/navigation";
import { normalizeEmail } from "@/lib/auth/identity";
import {
  RegistrationError,
  createAccount,
  isSignupOpen,
  validateAccount,
} from "@/lib/auth/registration";

export type SignupState = { error?: string };

export async function createUser(
  _prev: SignupState,
  formData: FormData,
): Promise<SignupState> {
  // A server action is a public HTTP endpoint. Anyone can post to it directly,
  // so this check is the real door — hiding the form would not close it.
  if (!(await isSignupOpen())) {
    return {
      error:
        "Sign-up is closed. New accounts are created from Settings by someone already signed in.",
    };
  }

  const username = String(formData.get("username") ?? "").trim();
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const password = String(formData.get("password") ?? "");

  const invalid = validateAccount({ username, email, password });
  if (invalid) return { error: invalid };

  try {
    await createAccount({ username, email, password });
  } catch (e) {
    if (e instanceof RegistrationError) return { error: e.message };
    throw e;
  }

  // redirect() works by throwing a control-flow signal, so it must sit outside
  // the try block — a catch would otherwise swallow it and the redirect would
  // silently never happen.
  redirect("/login");
}
