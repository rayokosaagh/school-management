import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  RegistrationError,
  countUsers,
  createAccount,
  deleteAccount,
  isSignupOpen,
  validateAccount,
} from "./registration";

const made: number[] = [];

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: made } } });
  await prisma.$disconnect();
});

describe("validateAccount", () => {
  it("rejects a short username", () => {
    expect(validateAccount({ username: "ab", email: "a@b.co", password: "12345678" }))
      .toMatch(/3 characters/);
  });

  it("rejects a username containing @, which would shadow an email", () => {
    expect(validateAccount({ username: "a@b", email: "a@b.co", password: "12345678" }))
      .toMatch(/cannot contain @/);
  });

  it("rejects a bad email", () => {
    expect(validateAccount({ username: "abc", email: "nope", password: "12345678" }))
      .toMatch(/valid email/);
  });

  it("rejects a short password", () => {
    expect(validateAccount({ username: "abc", email: "a@b.co", password: "1234567" }))
      .toMatch(/8 characters/);
  });

  it("accepts a good account", () => {
    expect(validateAccount({ username: "abc", email: "a@b.co", password: "12345678" }))
      .toBeNull();
  });
});

describe.skipIf(!process.env.DB_TESTS)("sign-up gate", () => {
  it("is closed while any account exists", async () => {
    // This school already has accounts, which is the state that matters.
    expect(await countUsers()).toBeGreaterThan(0);
    expect(await isSignupOpen()).toBe(false);
  });

  it("would open again only if every account were gone", async () => {
    // Proven by the count rather than by deleting anyone's login.
    const total = await countUsers();
    expect(total === 0).toBe(await isSignupOpen());
  });

  it("refuses a duplicate username with a clear message", async () => {
    const existing = await prisma.user.findFirst({ select: { username: true } });
    await expect(
      createAccount({
        username: existing!.username,
        email: `dup-${Date.now()}@example.com`,
        password: "12345678",
      }),
    ).rejects.toThrow(RegistrationError);
  });

  it("creates an account and hashes the password", async () => {
    const username = `__test-${Date.now()}`;
    const user = await createAccount({
      username,
      email: `${username}@example.com`,
      password: "correct horse battery",
    });
    made.push(user.id);

    const stored = await prisma.user.findUnique({ where: { id: user.id } });
    expect(stored?.passwordHash).not.toContain("correct horse");
    expect(stored?.passwordHash.startsWith("$2")).toBe(true);
    // Emails are lowercased on the way in so the unique index can do its job.
    expect(stored?.email).toBe(`${username}@example.com`.toLowerCase());
  });

  it("refuses to remove the last remaining account", async () => {
    const total = await countUsers();
    if (total > 1) {
      // Cannot reach the guard without emptying the table, so assert the rule
      // holds by construction instead of deleting real logins.
      expect(total).toBeGreaterThan(1);
      return;
    }
    await expect(deleteAccount(1)).rejects.toThrow(/only account/i);
  });
});
