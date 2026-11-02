import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";
import { redeemRememberToken, REMEMBER_COOKIE, rememberCookieOptions } from "@/lib/auth/remember";
import { restoreByIp } from "@/lib/auth/rateLimit";
import { safeNext } from "@/lib/auth/safeNext";
import { clientIp } from "@/lib/http/clientIp";

export const dynamic = "force-dynamic";

// WHY: relative Location, not NextResponse.redirect(new URL(path, request.url)): in a route handler
// request.url carries the server's configured hostname (localhost), not the Host the browser used,
// so an absolute redirect would leave the origin the cookies belong to. Browsers resolve a relative Location.
function see(path: string) {
  return new NextResponse(null, { status: 303, headers: { Location: path, "Cache-Control": "no-store" } });
}

/** 303 back to /login with r=0 ("do not try to restore again"); next is validated, never raw. */
function failure(next: string) {
  return see(`/login?next=${encodeURIComponent(safeNext(next))}&r=0`);
}

export async function GET(request: Request) {
  const next = new URL(request.url).searchParams.get("next") ?? "";
  try {
    // WHY: only a top-level document navigation may rotate the token; <img>/prefetch/fetch would burn it.
    const dest = request.headers.get("sec-fetch-dest");
    if (dest !== null && dest !== "document") {
      return new NextResponse(null, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
    if (!restoreByIp.hit(clientIp(request.headers) ?? "unknown").ok) return failure(next);

    const store = await cookies();
    const result = await redeemRememberToken(store.get(REMEMBER_COOKIE)?.value, request.headers.get("user-agent"));
    if (!result.ok) {
      // WHY: on "unknown" the cookie stays — a parallel request may have rotated it and its fresh
      // cookie must not be overwritten by a deletion; every other failure invalidates the cookie.
      if (result.reason !== "unknown") store.delete(REMEMBER_COOKIE);
      return failure(next);
    }

    const { token, expiresAt } = await createSession(result.userId);
    store.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
    store.set(REMEMBER_COOKIE, result.next.value, rememberCookieOptions(result.next.expiresAt));
    return see(safeNext(next));
  } catch (err) {
    // WHY: restore is best-effort (e.g. migration not applied yet); never a 500, never a token in logs.
    console.error("[auth/restore] failed:", (err as Error).message);
    return failure(next);
  }
}
