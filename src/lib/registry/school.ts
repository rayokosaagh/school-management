import { prisma } from "@/lib/prisma";
import { normalizeLanguage, type Language } from "@/lib/i18n/translations";

// One row, id 1. Printed documents need a letterhead, and a school has exactly
// one identity — so this is a settings record, not a table of schools.
const ID = 1;

export type SchoolInput = {
  name: string;
  nameNp?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  language?: Language;
};

export type SchoolLogo = {
  data: Uint8Array<ArrayBuffer>;
  mimeType: string;
};

export function getSchool() {
  return prisma.schoolProfile.findUnique({
    where: { id: ID },
    include: { logo: { select: { id: true } } },
  });
}

export function saveSchool(
  input: SchoolInput,
  options: { logo?: SchoolLogo; removeLogo?: boolean } = {},
) {
  const data = {
    name: input.name.trim(),
    nameNp: input.nameNp?.trim() || null,
    address: input.address?.trim() || null,
    phone: input.phone?.trim() || null,
    email: input.email?.trim() || null,
    language: normalizeLanguage(input.language),
  };

  return prisma.$transaction(async (tx) => {
    const current = await tx.schoolProfile.findUnique({
      where: { id: ID },
      select: { logoId: true },
    });
    const school = await tx.schoolProfile.upsert({
      where: { id: ID },
      create: { id: ID, ...data },
      update: data,
    });

    if (!options.logo && !options.removeLogo) return school;

    const logo = options.logo
      ? await tx.photo.create({ data: options.logo })
      : null;
    const updated = await tx.schoolProfile.update({
      where: { id: ID },
      data: { logoId: logo?.id ?? null },
    });

    // Photo rows are owned by their subject. Replacing or clearing the logo
    // must not leave an unused image in the database backups.
    if (current?.logoId) {
      await tx.photo.delete({ where: { id: current.logoId } });
    }
    return updated;
  });
}

/// What a letterhead needs, with a usable fallback so a marksheet never prints
/// a blank masthead before anyone has filled the settings in.
export async function getLetterhead() {
  const school = await getSchool();
  const language = normalizeLanguage(school?.language);
  const name = school?.name ?? "School name not set";
  return {
    name,
    nameNp: school?.nameNp ?? null,
    displayName: language === "ne" && school?.nameNp ? school.nameNp : name,
    address: school?.address ?? null,
    phone: school?.phone ?? null,
    email: school?.email ?? null,
    language,
    logoId: school?.logoId ?? null,
    configured: Boolean(school?.name),
  };
}
