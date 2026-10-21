import { getBatchProgress } from "@/lib/batch-progress";
import { withApiSession } from "@/lib/session";

// Polled every 3 seconds by the Generating screen (γ4 orientation Q6).
export async function GET(_request: Request, { params }: RouteContext<"/api/batches/[batchId]/progress">) {
  return withApiSession(async () => {
    const { batchId } = await params;
    const progress = await getBatchProgress(batchId);
    if (!progress) return Response.json({ error: "This batch no longer exists." }, { status: 404 });
    return Response.json(progress, { headers: { "cache-control": "no-store" } });
  });
}
