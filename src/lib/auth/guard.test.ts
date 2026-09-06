import { beforeEach, describe, expect, it, vi } from "vitest";

const deps = vi.hoisted(() => ({ auth: vi.fn(), user: { findUnique: vi.fn() }, loadGrants: vi.fn() }));
vi.mock("@/lib/auth/auth", () => ({ auth: deps.auth }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: deps.user } }));
vi.mock("./permissions", () => ({ loadGrants: deps.loadGrants, granted: (grants: Record<string, Set<string>>, role: string, capability: string) => grants[role].has(capability) }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`Redirect: ${url}`); } }));
import { currentActor, requireCapability, requirePage } from "./guard";
import { CAPABILITIES, DEFAULT_GRANTS } from "./roles";

beforeEach(() => {
  vi.resetAllMocks();
  deps.auth.mockResolvedValue({ user: { id: "8", role: "ADMIN" } });
  deps.user.findUnique.mockResolvedValue({ id: 8, username: "teacher", role: "TEACHER", staff: { id: 6 } });
  deps.loadGrants.mockResolvedValue({ ADMIN: new Set(CAPABILITIES), OFFICE: new Set(DEFAULT_GRANTS.OFFICE), TEACHER: new Set(DEFAULT_GRANTS.TEACHER) });
});

describe("live authorization guards", () => {
  it("uses the database role instead of stale administrator claims", async () => {
    await expect(currentActor()).resolves.toEqual({ userId: 8, username: "teacher", role: "TEACHER", staffId: 6 });
    await expect(requireCapability("manage:fees")).rejects.toThrow("does not have permission");
  });
  it("denies a permission revoked after login", async () => {
    deps.user.findUnique.mockResolvedValue({ id: 8, username: "office", role: "OFFICE", staff: null });
    deps.loadGrants.mockResolvedValue({ OFFICE: new Set() });
    await expect(requireCapability("manage:fees")).rejects.toThrow("does not have permission");
    await expect(requirePage("/dashboard/fees")).rejects.toThrow("Redirect: /dashboard?denied=1");
  });
  it("allows a currently granted capability", async () => {
    await expect(requireCapability("take:attendance")).resolves.toMatchObject({ userId: 8, role: "TEACHER" });
  });
  it("rejects a deleted user even with a valid session", async () => {
    deps.user.findUnique.mockResolvedValue(null);
    await expect(requireCapability("manage:fees")).rejects.toThrow("not signed in");
    await expect(requirePage("/dashboard/fees")).rejects.toThrow("Redirect: /login");
    expect(deps.loadGrants).not.toHaveBeenCalled();
  });
  it("rejects absent sessions without querying accounts", async () => {
    deps.auth.mockResolvedValue(null);
    await expect(requireCapability("manage:fees")).rejects.toThrow("not signed in");
    expect(deps.user.findUnique).not.toHaveBeenCalled();
  });
});
