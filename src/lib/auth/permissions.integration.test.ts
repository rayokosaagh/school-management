import { afterAll, afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  PermissionError,
  granted,
  readGrants,
  resetGrants,
  setGrant,
} from "./permissions";
import { CAPABILITIES } from "./roles";

// loadGrants is request-cached, so each assertion reads straight from the
// database rather than through it.
const fresh = async () => {
  const rows = await prisma.rolePermission.findMany();
  return rows;
};

afterEach(async () => {
  await resetGrants();
});

afterAll(async () => {
  await resetGrants();
  await prisma.$disconnect();
});

describe.skipIf(!process.env.DB_TESTS)("permission matrix", () => {
  it("starts from the defaults with no stored rows", async () => {
    expect(await fresh()).toHaveLength(0);
    const grants = await readGrants();
    expect(granted(grants, "OFFICE", "manage:registry")).toBe(true);
    expect(granted(grants, "OFFICE", "manage:settings")).toBe(false);
    expect(granted(grants, "TEACHER", "manage:registry")).toBe(false);
  });

  it("stores only the difference from the default", async () => {
    // Granting something a role already has by default writes nothing.
    await setGrant("OFFICE", "manage:registry", true);
    expect(await fresh()).toHaveLength(0);

    // Taking it away is a difference, so it is recorded.
    await setGrant("OFFICE", "manage:registry", false);
    expect(await fresh()).toHaveLength(1);

    // Putting it back returns to the default and removes the row.
    await setGrant("OFFICE", "manage:registry", true);
    expect(await fresh()).toHaveLength(0);
  });

  it("refuses to change an administrator's permissions", async () => {
    await expect(setGrant("ADMIN", "manage:settings", false)).rejects.toThrow(
      PermissionError,
    );
    await expect(setGrant("ADMIN", "manage:registry", false)).rejects.toThrow(
      /always hold every permission/i,
    );
  });

  it("keeps an administrator at full access even if a row is forced in", async () => {
    // Written directly, bypassing setGrant — the loader must still not weaken it.
    await prisma.rolePermission.create({
      data: { role: "ADMIN", capability: "manage:settings", granted: false },
    });
    const grants = await readGrants();
    for (const capability of CAPABILITIES) {
      expect(granted(grants, "ADMIN", capability)).toBe(true);
    }
  });

  it("rejects an unknown capability", async () => {
    await expect(
      // @ts-expect-error deliberately not a Capability
      setGrant("OFFICE", "manage:everything", true),
    ).rejects.toThrow(PermissionError);
  });

  it("can grant a teacher something they do not have by default", async () => {
    await setGrant("TEACHER", "manage:exams", true);
    const rows = await fresh();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      role: "TEACHER",
      capability: "manage:exams",
      granted: true,
    });
  });

  it("ignores stored rows for capabilities that no longer exist", async () => {
    // Deliberately not a real capability. It was "manage:timetable" until that
    // one shipped, which is the point: this test has to name something the
    // code does not know, so the assertion below guards the premise.
    const retired = "manage:cafeteria";
    await prisma.rolePermission.create({
      data: { role: "OFFICE", capability: retired, granted: true },
    });
    // Nothing throws, and the unknown capability is simply not in the set.
    const grants = await readGrants();
    expect(CAPABILITIES).not.toContain(retired);
    // The office keeps exactly its defaults; the unknown row changes nothing.
    expect(granted(grants, "OFFICE", "manage:registry")).toBe(true);
    expect(granted(grants, "OFFICE", "manage:settings")).toBe(false);
  });
});
