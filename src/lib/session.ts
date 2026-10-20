import "server-only";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import type { Session } from "next-auth";
import { auth } from "@/auth";

export type CurrentUser = { id: string; email: string; name: string | null };

function toCurrentUser(session: Session | null): CurrentUser | null {
  const user = session?.user;
  if (!user?.id || !user.email) return null;
  return { id: user.id, email: user.email, name: user.name ?? null };
}

// For Server Components and Server Actions: the signed-in user, or a redirect to sign-in.
export async function requireUser(): Promise<CurrentUser> {
  // The session read is request-time work; say so before Auth.js draws any random values.
  await connection();
  const user = toCurrentUser(await auth());
  if (!user) redirect("/signin");
  return user;
}

// For Route Handlers: every API route checks the session itself, not only the proxy.
export async function withApiSession(
  handler: (user: CurrentUser) => Promise<Response>,
  getSession: () => Promise<Session | null> = () => auth(),
): Promise<Response> {
  const user = toCurrentUser(await getSession());
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });
  return handler(user);
}
