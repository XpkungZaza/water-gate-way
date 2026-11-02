import { NextResponse, type NextRequest } from "next/server";

// WHY: same value as SESSION_COOKIE in lib/auth/session.ts; not imported because that module pulls in pg.
const SESSION_COOKIE = "wg_session";

// Optimistic check only: cookie presence. The real check is requireUser() in each route/page/action.
export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (pathname === "/login" || pathname === "/register" || req.cookies.has(SESSION_COOKIE)) return NextResponse.next();

  if (pathname === "/api" || pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL("/login", req.url);
  url.searchParams.set("next", pathname + search);
  return NextResponse.redirect(url);
}

// WHY: brand images are public. The login and sign-up pages (and the browser's tab/home-screen icon
// requests) load them before any session exists; without this they redirect to /login and arrive as HTML.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|logo-mark.png|logo.png).*)"],
};
