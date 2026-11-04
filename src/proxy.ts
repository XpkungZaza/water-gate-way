import { NextResponse, type NextRequest } from "next/server";

// WHY: same value as SESSION_COOKIE in lib/auth/session.ts; not imported because that module pulls in pg.
const SESSION_COOKIE = "wg_session";
// WHY: same value as REMEMBER_COOKIE in lib/auth/remember.ts; same no-pg reason.
const REMEMBER_COOKIE = "wg_remember";
const RESTORE_PATH = "/api/auth/restore";

// Optimistic check only: cookie presence. The real check is requireUser() in each route/page/action.
export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (pathname === "/login" || pathname === "/register" || pathname === RESTORE_PATH || req.cookies.has(SESSION_COOKIE))
    return NextResponse.next();

  if (pathname === "/api" || pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // WHY: a remember cookie without a session is what restore exists for; send it there instead of /login.
  const url = new URL(req.cookies.has(REMEMBER_COOKIE) ? RESTORE_PATH : "/login", req.url);
  url.searchParams.set("next", pathname + search);
  return NextResponse.redirect(url);
}

// WHY: brand images are public. The login and sign-up pages (and the browser's tab/home-screen icon
// requests) load them before any session exists; without this they redirect to /login and arrive as HTML.
export const config = {
  // WHY: manifest and robots are fetched without cookies (the browser requests the manifest anonymously); behind
  // the login redirect they come back as HTML and the manifest is a parse error on every page.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|logo-mark.png|logo.png|manifest.webmanifest|robots.txt).*)"],
};
