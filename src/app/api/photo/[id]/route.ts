import { auth } from "@/lib/auth/auth";
import { getPhoto } from "@/lib/registry/photos";

// Photos are pupil and staff records, so this endpoint is behind the session
// like every page. The proxy skips /api, hence the explicit check here.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  const photoId = Number(id);
  if (!Number.isInteger(photoId)) return new Response("Not found", { status: 404 });

  const photo = await getPhoto(photoId);
  if (!photo) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(photo.data), {
    headers: {
      "Content-Type": photo.mimeType,
      // A photo row is replaced rather than edited, so its id is immutable.
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
