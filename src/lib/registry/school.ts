import { prisma } from "@/lib/prisma";

// One row, id 1. Printed documents need a letterhead, and a school has exactly
// one identity — so this is a settings record, not a table of schools.
const ID = 1;

export type SchoolInput = {
  name: string;
  nameNp?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
};

export function getSchool() {
  return prisma.schoolProfile.findUnique({
    where: { id: ID },
    include: { logo: { select: { id: true } } },
  });
}

export function saveSchool(input: SchoolInput) {
  const data = {
    name: input.name.trim(),
    nameNp: input.nameNp?.trim() || null,
    address: input.address?.trim() || null,
    phone: input.phone?.trim() || null,
    email: input.email?.trim() || null,
  };
  return prisma.schoolProfile.upsert({
    where: { id: ID },
    create: { id: ID, ...data },
    update: data,
  });
}

/// What a letterhead needs, with a usable fallback so a marksheet never prints
/// a blank masthead before anyone has filled the settings in.
export async function getLetterhead() {
  const school = await getSchool();
  return {
    name: school?.name ?? "School name not set",
    nameNp: school?.nameNp ?? null,
    address: school?.address ?? null,
    phone: school?.phone ?? null,
    email: school?.email ?? null,
    logoId: school?.logoId ?? null,
    configured: Boolean(school?.name),
  };
}
