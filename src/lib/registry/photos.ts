import { prisma } from "@/lib/prisma";

export class PhotoError extends Error {}

// Passport-style photos only, so the ceiling is deliberately low: anything
// larger is a camera dump that will bloat every backup.
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

/// Reads an uploaded file, validating type and size before it reaches the row.
export async function readUpload(
  file: unknown,
): Promise<{ data: Uint8Array<ArrayBuffer>; mimeType: string }> {
  if (!(file instanceof File) || file.size === 0) {
    throw new PhotoError("Choose an image file.");
  }
  if (!ALLOWED.has(file.type)) {
    throw new PhotoError("Photo must be a JPEG, PNG or WebP.");
  }
  if (file.size > MAX_PHOTO_BYTES) {
    throw new PhotoError("Photo must be under 2 MB.");
  }
  const data = new Uint8Array(await file.arrayBuffer());

  // Trust the bytes, not the declared type: a renamed .exe arrives as image/png.
  if (!looksLikeImage(data)) {
    throw new PhotoError("That file is not a readable image.");
  }
  return { data, mimeType: file.type };
}

function looksLikeImage(b: Uint8Array<ArrayBuffer>) {
  if (b.length < 12) return false;
  const jpeg = b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  const png =
    b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  const ascii = (from: number, to: number) =>
    String.fromCharCode(...b.subarray(from, to));
  const webp = ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP";
  return jpeg || png || webp;
}

/// Replaces the subject's photo, deleting the old row so orphans cannot pile up.
export async function setStudentPhoto(studentId: number, file: unknown) {
  const { data, mimeType } = await readUpload(file);
  return prisma.$transaction(async (tx) => {
    const current = await tx.student.findUnique({
      where: { id: studentId },
      select: { photoId: true },
    });
    const photo = await tx.photo.create({ data: { data, mimeType } });
    await tx.student.update({ where: { id: studentId }, data: { photoId: photo.id } });
    if (current?.photoId) await tx.photo.delete({ where: { id: current.photoId } });
    return photo.id;
  });
}

export async function setStaffPhoto(staffId: number, file: unknown) {
  const { data, mimeType } = await readUpload(file);
  return prisma.$transaction(async (tx) => {
    const current = await tx.staff.findUnique({
      where: { id: staffId },
      select: { photoId: true },
    });
    const photo = await tx.photo.create({ data: { data, mimeType } });
    await tx.staff.update({ where: { id: staffId }, data: { photoId: photo.id } });
    if (current?.photoId) await tx.photo.delete({ where: { id: current.photoId } });
    return photo.id;
  });
}

export async function clearStudentPhoto(studentId: number) {
  const current = await prisma.student.findUnique({
    where: { id: studentId },
    select: { photoId: true },
  });
  if (!current?.photoId) return;
  await prisma.student.update({ where: { id: studentId }, data: { photoId: null } });
  await prisma.photo.delete({ where: { id: current.photoId } });
}

export async function clearStaffPhoto(staffId: number) {
  const current = await prisma.staff.findUnique({
    where: { id: staffId },
    select: { photoId: true },
  });
  if (!current?.photoId) return;
  await prisma.staff.update({ where: { id: staffId }, data: { photoId: null } });
  await prisma.photo.delete({ where: { id: current.photoId } });
}

export function getPhoto(id: number) {
  return prisma.photo.findUnique({ where: { id } });
}
