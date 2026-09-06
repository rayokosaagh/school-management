import { beforeEach, describe, expect, it, vi } from "vitest";
const deps = vi.hoisted(() => ({ auth: vi.fn(), findUnique: vi.fn(), loadGrants: vi.fn(), setCurrentAcademicYear: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/auth", () => ({ auth: deps.auth }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: deps.findUnique } } }));
vi.mock("@/lib/auth/permissions", () => ({ loadGrants: deps.loadGrants, granted: (grants: Record<string, Set<string>>, role: string, capability: string) => grants[role].has(capability) }));
vi.mock("next/cache", () => ({ revalidatePath: deps.revalidatePath }));
vi.mock("@/lib/registry/academic-year", () => ({ setCurrentAcademicYear: deps.setCurrentAcademicYear, UnknownYearError: class extends Error {} }));
vi.mock("@/lib/announcements/announcements", () => ({ AnnouncementError: class extends Error {} }));
import { switchAcademicYear } from "./actions";
import { DEFAULT_GRANTS } from "@/lib/auth/roles";

beforeEach(() => {
  vi.resetAllMocks();
  deps.auth.mockResolvedValue({ user: { id: "8", role: "ADMIN" } });
  deps.loadGrants.mockResolvedValue({ TEACHER: new Set(DEFAULT_GRANTS.TEACHER), OFFICE: new Set(DEFAULT_GRANTS.OFFICE) });
});

describe("school-wide year switch authorization", () => {
  it("denies a teacher with stale admin token without changing the school year", async () => {
    deps.findUnique.mockResolvedValue({ id: 8, username: "teacher", role: "TEACHER", staff: null });
    const form = new FormData();
    form.set("academicYearId", "5");
    await expect(switchAcademicYear({}, form)).resolves.toMatchObject({ error: expect.any(String) });
    expect(deps.setCurrentAcademicYear).not.toHaveBeenCalled();
    expect(deps.revalidatePath).not.toHaveBeenCalled();
  });
  it("passes the authorized office actor into the audited year change", async () => {
    deps.findUnique.mockResolvedValue({ id: 8, username: "office", role: "OFFICE", staff: null });
    const form = new FormData();
    form.set("academicYearId", "5");
    await expect(switchAcademicYear({}, form)).resolves.toMatchObject({ success: expect.any(String) });
    expect(deps.setCurrentAcademicYear).toHaveBeenCalledWith(5, expect.objectContaining({ userId: 8, username: "office", role: "OFFICE" }));
    expect(deps.revalidatePath).toHaveBeenCalledWith("/dashboard", "layout");
  });
});
