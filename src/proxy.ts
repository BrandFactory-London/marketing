import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { auth } from "@/auth";

// First line of defence: send signed-out visitors to /signin. Pages, Server Actions and Route
// Handlers still check the session themselves (src/lib/session.ts).
const guard = auth((request) => {
  if (request.auth) return NextResponse.next();
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return Response.json({ error: "Sign in required." }, { status: 401 });
  }
  return NextResponse.redirect(new URL("/signin", request.nextUrl.origin));
});

type Guard = (request: NextRequest, event: NextFetchEvent) => Promise<Response>;

// With a lazy Auth.js config, auth(handler) resolves to the wrapped handler, so Next needs a plain function here.
export default async function proxy(request: NextRequest, event: NextFetchEvent): Promise<Response> {
  const handler = (await guard) as unknown as Guard;
  return handler(request, event);
}

export const config = {
  // Everything except the sign-in page, the auth API and static files.
  matcher: ["/((?!signin|api/auth|_next/static|_next/image|favicon\\.ico).*)"],
};
