"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth/auth";
import { ForbiddenError, requireCapability } from "@/lib/auth/guard";
import { WeightsError, saveWeights } from "@/lib/honours/weights";
import { isValidEmail, normalizeEmail } from "@/lib/auth/identity";
import { saveSchool } from "@/lib/registry/school";
import type { Role } from "@/generated/prisma/enums";
import { numericField } from "@/lib/form";
import {
  CAPABILITIES,
  CAPABILITY_LABEL,
  ROLE_LABEL,
  type Capability,
} from "@/lib/auth/roles";
import {
  PermissionError,
  resetGrants,
  setGrant,
} from "@/lib/auth/permissions";
import {
  RegistrationError,
  createAccount,
  deleteAccount,
  linkStaff,
  setAccountRole,
  validateAccount,
} from "@/lib/auth/registration";

const ROLES: Role[] = ["ADMIN", "OFFICE", "TEACHER"];

export type EmailState = { error?: string; success?: string };

export async function updateEmail(
  _prev: EmailState,
  formData: FormData,
): Promise<EmailState> {
  // The account being edited comes from the session, never from the form. If a
  // hidden userId field decided this, anyone could post another id and take
  // over that account's email — and email is a login identifier here.
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { error: "You are not signed in." };

  const raw = String(formData.get("email") ?? "");
  const email = normalizeEmail(raw);

  // Empty input clears the address rather than failing, so an account can go
  // back to username-only login. NULL, not "", or the unique index would treat
  // two cleared accounts as duplicates.
  if (email === "") {
    await prisma.user.update({
      where: { id: Number(userId) },
      data: { email: null },
    });
    revalidatePath("/dashboard/settings");
    return { success: "Email removed." };
  }

  if (!isValidEmail(email)) {
    return { error: "Enter a valid email address." };
  }

  try {
    await prisma.user.update({
      where: { id: Number(userId) },
      data: { email },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: "That email is already used by another account." };
    }
    throw e;
  }

  // The layout reads the session, and this page reads the user row, so the
  // server render has to be invalidated for the new value to appear.
  revalidatePath("/dashboard/settings");
  return { success: "Email saved. You can now sign in with it." };
}

export type SchoolState = { error?: string; success?: string };

export async function updateSchool(
  _prev: SchoolState,
  formData: FormData,
): Promise<SchoolState> {
  try {
    await requireCapability("manage:settings");
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: e.message };
    throw e;
  }

  const name = String(formData.get("name") ?? "").trim();
  const nameNp = String(formData.get("nameNp") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();

  if (name.length < 2) return { error: "Enter the school's name." };
  if (email && !isValidEmail(email)) return { error: "Enter a valid email address." };

  await saveSchool({ name, nameNp, address, phone, email });

  // The name shows in the dashboard header and on every printed marksheet.
  revalidatePath("/dashboard", "layout");
  return { success: "School details saved." };
}

export type AccountState = { error?: string; success?: string };

/// Adding an account is the replacement for public sign-up, so it is behind the
/// session — the only trust boundary this system currently has.
export async function addAccount(
  _prev: AccountState,
  formData: FormData,
): Promise<AccountState> {
  try {
    await requireCapability("manage:settings");
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: e.message };
    throw e;
  }

  const username = String(formData.get("username") ?? "").trim();
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const password = String(formData.get("password") ?? "");

  const role = String(formData.get("role") ?? "OFFICE") as Role;
  const rawStaff = String(formData.get("staffId") ?? "");
  const staffId = rawStaff === "" ? null : Number(rawStaff);

  const invalid = validateAccount({ username, email, password });
  if (invalid) return { error: invalid };
  if (!ROLES.includes(role)) return { error: "Pick a role." };
  if (staffId !== null && !Number.isInteger(staffId)) {
    return { error: "Pick a staff member." };
  }
  if (role === "TEACHER" && staffId === null) {
    // Teacher permissions are scoped through the staff record; without one they
    // would sign in able to reach nothing at all.
    return { error: "A teacher account must be linked to a staff member." };
  }

  try {
    await createAccount({ username, email, password, role, staffId });
  } catch (e) {
    if (e instanceof RegistrationError) return { error: e.message };
    throw e;
  }

  revalidatePath("/dashboard/settings");
  return { success: `Account for ${username} created.` };
}

export async function removeAccount(
  _prev: AccountState,
  formData: FormData,
): Promise<AccountState> {
  let actorId: number;
  try {
    const actor = await requireCapability("manage:settings");
    actorId = actor.userId;
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: e.message };
    throw e;
  }

  const id = numericField(formData, "userId");
  if (id === null) return { error: "Pick an account." };
  if (id === actorId) {
    return { error: "You cannot remove the account you are signed in with." };
  }

  try {
    await deleteAccount(id);
  } catch (e) {
    if (e instanceof RegistrationError) return { error: e.message };
    throw e;
  }

  revalidatePath("/dashboard/settings");
  return { success: "Account removed." };
}

export async function changeAccountRole(
  _prev: AccountState,
  formData: FormData,
): Promise<AccountState> {
  try {
    await requireCapability("manage:settings");
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: e.message };
    throw e;
  }

  const id = Number(formData.get("userId"));
  const role = String(formData.get("role") ?? "") as Role;
  if (!Number.isInteger(id)) return { error: "Pick an account." };
  if (!ROLES.includes(role)) return { error: "Pick a role." };

  try {
    await setAccountRole(id, role);
  } catch (e) {
    if (e instanceof RegistrationError) return { error: e.message };
    throw e;
  }

  revalidatePath("/dashboard/settings");
  return {
    success: `Role changed to ${ROLE_LABEL[role]}. It applies to their next sign-in.`,
  };
}

export async function changeStaffLink(
  _prev: AccountState,
  formData: FormData,
): Promise<AccountState> {
  try {
    await requireCapability("manage:settings");
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: e.message };
    throw e;
  }

  const userId = Number(formData.get("userId"));
  const raw = String(formData.get("staffId") ?? "");
  if (!Number.isInteger(userId)) return { error: "Pick an account." };

  const staffId = raw === "" ? null : Number(raw);
  if (staffId !== null && !Number.isInteger(staffId)) return { error: "Pick a staff member." };

  await linkStaff(userId, staffId);
  revalidatePath("/dashboard/settings");
  return {
    success: staffId === null ? "Unlinked." : "Linked to that staff member.",
  };
}

export async function togglePermission(
  _prev: AccountState,
  formData: FormData,
): Promise<AccountState> {
  try {
    await requireCapability("manage:settings");
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: e.message };
    throw e;
  }

  const role = String(formData.get("role") ?? "") as Role;
  const capability = String(formData.get("capability") ?? "") as Capability;
  const allow = formData.get("allow") === "1";

  if (!ROLES.includes(role)) return { error: "Pick a role." };
  if (!CAPABILITIES.includes(capability)) return { error: "Unknown permission." };

  try {
    await setGrant(role, capability, allow);
  } catch (e) {
    if (e instanceof PermissionError) return { error: e.message };
    throw e;
  }

  revalidatePath("/dashboard", "layout");
  return {
    success: `${ROLE_LABEL[role]}: ${CAPABILITY_LABEL[capability]} ${allow ? "allowed" : "blocked"}.`,
  };
}

export async function restoreDefaultPermissions(
  _prev: AccountState,
  _formData: FormData,
): Promise<AccountState> {
  void _formData;
  try {
    await requireCapability("manage:settings");
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: e.message };
    throw e;
  }

  await resetGrants();
  revalidatePath("/dashboard", "layout");
  return { success: "Permissions restored to their defaults." };
}

export type WeightsState = { error?: string; success?: string };

/// Reads four whole numbers; the service checks they sum to 100.
export async function updateHonoursWeights(
  _prev: WeightsState,
  formData: FormData,
): Promise<WeightsState> {
  try {
    await requireCapability("manage:settings");
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: e.message };
    throw e;
  }

  const read = (name: string) => {
    const raw = String(formData.get(name) ?? "").trim();
    return raw === "" ? Number.NaN : Number(raw);
  };
  const weights = {
    exams: read("exams"),
    attendance: read("attendance"),
    conduct: read("conduct"),
    activities: read("activities"),
  };

  try {
    await saveWeights(weights);
  } catch (e) {
    if (e instanceof WeightsError) return { error: e.message };
    throw e;
  }

  // The Honours page and every student pane show scores built from these.
  revalidatePath("/dashboard", "layout");
  return { success: "Honours weighting saved." };
}
