import bcrypt from "bcryptjs";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { Role } from "@/generated/prisma/enums";
import { isValidEmail, normalizeEmail } from "@/lib/auth/identity";

// Public sign-up is open only until the first account exists. After that the
// school's records are behind a door, and new accounts are made from inside by
// somebody already trusted.

export class RegistrationError extends Error {}

export function countUsers() {
  return prisma.user.count();
}

/// Open only while the school has no accounts at all — the one-time bootstrap.
export async function isSignupOpen() {
  return (await countUsers()) === 0;
}

export type NewAccount = {
  username: string;
  email: string;
  password: string;
  role?: Role;
  /// Optional staff record to attach the login to. Teacher scoping reads it.
  staffId?: number | null;
};

/// Shared validation, so the public bootstrap and the internal "add account"
/// path cannot drift apart on what makes a valid login.
export function validateAccount({ username, email, password }: NewAccount): string | null {
  if (username.length < 3) return "Username must be at least 3 characters.";
  if (username.includes("@")) {
    // Otherwise a username could shadow somebody else's email at sign-in, since
    // the login query matches either column.
    return "Username cannot contain @.";
  }
  if (!isValidEmail(email)) return "Enter a valid email address.";
  if (password.length < 8) return "Password must be at least 8 characters.";
  return null;
}

/// Creates the login. Uniqueness is enforced by the database, because checking
/// first would still race between the read and the write.
export async function createAccount({
  username,
  email,
  password,
  role = "OFFICE",
  staffId = null,
}: NewAccount) {
  const passwordHash = await bcrypt.hash(password, 10);
  try {
    const user = await prisma.user.create({
      data: { username, email: normalizeEmail(email), passwordHash, role },
    });
    if (staffId !== null) {
      // One login per staff member; the column is unique, so a second attempt
      // surfaces rather than silently moving the link.
      await prisma.staff.update({ where: { id: staffId }, data: { userId: user.id } });
    }
    return user;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const target = String(e.meta?.target ?? "");
      throw new RegistrationError(
        target.includes("email")
          ? "That email is already registered."
          : "That username is already taken.",
      );
    }
    throw e;
  }
}

export function listAccounts() {
  return prisma.user.findMany({
    orderBy: { id: "asc" },
    select: {
      id: true,
      username: true,
      email: true,
      role: true,
      createdAt: true,
      staff: { select: { id: true, fullName: true, fullNameNp: true } },
    },
  });
}

/// The last account cannot be removed, or nobody can sign in and the school is
/// locked out of its own records.
export async function deleteAccount(id: number) {
  const total = await countUsers();
  if (total <= 1) {
    throw new RegistrationError("This is the only account. Add another before removing it.");
  }
  const staff = await prisma.staff.findFirst({ where: { userId: id } });
  if (staff) {
    await prisma.staff.update({ where: { id: staff.id }, data: { userId: null } });
  }
  return prisma.user.delete({ where: { id } });
}

/// Changing a role takes effect on the account's next sign-in for navigation,
/// and immediately for anything they try to do — actions read the database.
export async function setAccountRole(id: number, role: Role) {
  const admins = await prisma.user.count({ where: { role: "ADMIN" } });
  const current = await prisma.user.findUnique({ where: { id }, select: { role: true } });
  if (!current) throw new RegistrationError("That account no longer exists.");

  // Demoting the last administrator would leave nobody able to manage settings
  // or hand out logins.
  if (current.role === "ADMIN" && role !== "ADMIN" && admins <= 1) {
    throw new RegistrationError(
      "This is the only administrator. Promote someone else first.",
    );
  }
  return prisma.user.update({ where: { id }, data: { role } });
}

export async function linkStaff(userId: number, staffId: number | null) {
  await prisma.staff.updateMany({ where: { userId }, data: { userId: null } });
  if (staffId !== null) {
    await prisma.staff.update({ where: { id: staffId }, data: { userId } });
  }
}
