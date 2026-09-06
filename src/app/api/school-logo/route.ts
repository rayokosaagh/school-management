import { prisma } from "@/lib/prisma";

// The login page is public, so this deliberately exposes only the one image
// chosen as the school's public identity — never arbitrary staff or student
// photos from /api/photo.
export const dynamic = "force-dynamic";

export async function GET() {
  const school = await prisma.schoolProfile.findUnique({
    where: { id: 1 },
    select: { logo: true },
  });
  if (!school?.logo) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(school.logo.data), {
    headers: {
      "Content-Type": school.logo.mimeType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
