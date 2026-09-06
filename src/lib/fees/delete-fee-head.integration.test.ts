import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { FeeError, createFeeHead, deleteFeeHead } from "./fees";

// Deleting a fee type is the one destructive thing the fee setup offers, so
// the line between "never billed" and "on somebody's invoice" is worth a real
// database behind it rather than a mock.

const stamp = Date.now() % 1000000;
const made: number[] = [];

afterAll(async () => {
  await prisma.feeHead.deleteMany({ where: { id: { in: made } } });
  await prisma.$disconnect();
});

describe.skipIf(!process.env.DB_TESTS)("deleting a fee type", () => {
  it("removes one nobody has been billed for", async () => {
    const head = await createFeeHead(`__del unused ${stamp}`, "ONE_TIME");
    made.push(head.id);
    await expect(deleteFeeHead(head.id)).resolves.toMatchObject({ name: head.name });
    expect(await prisma.feeHead.findUnique({ where: { id: head.id } })).toBeNull();
  });

  it("refuses one that is already on a bill, and says to stop using it instead", async () => {
    const billed = await prisma.feeHead.findFirst({
      where: { invoiceLines: { some: {} } },
      select: { id: true, name: true },
    });
    if (!billed) return; // nothing invoiced in this database yet
    await expect(deleteFeeHead(billed.id)).rejects.toBeInstanceOf(FeeError);
    await expect(deleteFeeHead(billed.id)).rejects.toThrow(/Stop using it instead/);
    expect(await prisma.feeHead.findUnique({ where: { id: billed.id } })).not.toBeNull();
  });

  it("is clear about a fee type that has already gone", async () => {
    await expect(deleteFeeHead(-1)).rejects.toThrow(/no longer exists/);
  });
});
