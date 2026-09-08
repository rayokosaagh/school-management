import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { getLetterhead, getSchool, saveSchool } from "./school";
import { normalizeLanguage } from "@/lib/i18n/translations";

// The school profile is a single row, so this test has to put back whatever was
// there before rather than delete it.
let original: Awaited<ReturnType<typeof getSchool>> = null;

afterAll(async () => {
  if (original) {
    await saveSchool({
      name: original.name,
      nameNp: original.nameNp,
      address: original.address,
      phone: original.phone,
      email: original.email,
      language: normalizeLanguage(original.language),
    });
  } else {
    await prisma.schoolProfile.deleteMany({});
  }
  await prisma.$disconnect();
});

describe.skipIf(!process.env.DB_TESTS)("school profile", () => {
  it("reports an unset profile rather than throwing", async () => {
    original = await getSchool();
    if (!original) {
      const letterhead = await getLetterhead();
      expect(letterhead.configured).toBe(false);
      expect(letterhead.name).toBe("School name not set");
    }
  });

  it("creates the row on first save", async () => {
    const saved = await saveSchool({
      name: "__test Shree Janata Secondary School",
      nameNp: "श्री जनता माध्यमिक विद्यालय",
      address: "Lalitpur-3, Bagmati",
      phone: "9801234567",
      email: "office@example.com",
    });
    expect(saved.id).toBe(1);
    expect(saved.name).toBe("__test Shree Janata Secondary School");
  });

  it("updates in place rather than adding a second row", async () => {
    await saveSchool({ name: "__test Renamed School" });
    const rows = await prisma.schoolProfile.count();
    expect(rows).toBe(1);

    const school = await getSchool();
    expect(school?.name).toBe("__test Renamed School");
    // Fields left out of the input are cleared, not silently retained.
    expect(school?.address).toBeNull();
  });

  it("trims whitespace and stores empty optionals as null", async () => {
    await saveSchool({
      name: "  __test Spaced School  ",
      nameNp: "   ",
      address: "",
      phone: "  9800000000  ",
    });
    const school = await getSchool();
    expect(school?.name).toBe("__test Spaced School");
    expect(school?.nameNp).toBeNull();
    expect(school?.address).toBeNull();
    expect(school?.phone).toBe("9800000000");
  });

  it("feeds the letterhead once configured", async () => {
    await saveSchool({
      name: "__test Letterhead School",
      address: "Kathmandu-11",
      phone: "9812345678",
    });
    const letterhead = await getLetterhead();
    expect(letterhead.configured).toBe(true);
    expect(letterhead.name).toBe("__test Letterhead School");
    expect(letterhead.address).toBe("Kathmandu-11");
  });

  it("uses the Nepali school name when the interface is Nepali", async () => {
    await saveSchool({
      name: "__test Janata School",
      nameNp: "जनता विद्यालय",
      language: "ne",
    });
    const letterhead = await getLetterhead();
    expect(letterhead.language).toBe("ne");
    expect(letterhead.displayName).toBe("जनता विद्यालय");
    expect(letterhead.name).toBe("__test Janata School");
  });
});
