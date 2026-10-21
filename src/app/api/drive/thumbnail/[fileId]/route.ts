import { coverThumbnail, THUMBNAIL_SIZES } from "@/lib/covers";
import { withApiSession } from "@/lib/session";
import { isUuid } from "@/lib/validation";

// The cover picker's thumbnails (γ5 orientation Q6). Drive files are private, so the app fetches each thumbnail
// with the stored Google token, only for photos under the project's folder.
export async function GET(request: Request, { params }: RouteContext<"/api/drive/thumbnail/[fileId]">) {
  return withApiSession(async (user) => {
    const { fileId } = await params;
    const url = new URL(request.url);
    const projectId = url.searchParams.get("project");
    const size = Number(url.searchParams.get("size"));
    if (!projectId || !isUuid(projectId)) return new Response("Not found", { status: 404 });
    return coverThumbnail(user.id, projectId, fileId, (THUMBNAIL_SIZES as readonly number[]).includes(size) ? size : THUMBNAIL_SIZES[0]);
  });
}
