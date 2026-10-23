import { syncCalendarSafely } from "@/lib/calendar-sync";

// The daily safety-net pass (γ8 orientation Q2, approval): catches changes made by Trigger.dev tasks while nobody had
// the app open. Vercel Cron calls it with "Authorization: Bearer <CRON_SECRET>"; without the secret it refuses.
export const maxDuration = 60;

export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "CRON_SECRET is not set." }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "Not allowed." }, { status: 401 });
  const result = await syncCalendarSafely();
  return Response.json(result);
}
