import { NextResponse } from "next/server";
import { requireUser, authErrorResponse } from "@/lib/auth/dal";
import { CAMERAS } from "@/lib/gates";

export const dynamic = "force-dynamic";

const ALLOWED: ReadonlySet<string> = new Set(CAMERAS);
const CONNECT_TIMEOUT_MS = 10_000;
// WHY: a camera that sends headers and then nothing would otherwise hold a slot (and a spinning player)
// until MAX_LIFETIME_MS. Only time spent waiting on go2rtc counts, never browser backpressure.
const IDLE_TIMEOUT_MS = 10_000;
// WHY: a live stream never ends by itself. Cutting it lets the player reconnect, which re-runs
// requireUser, so a signed-out or disabled user stops receiving video.
const MAX_LIFETIME_MS = 10 * 60_000;
// WHY: every open stream holds a camera connection on the Pi (3 cameras x 2 tabs).
const MAX_STREAMS_PER_USER = 6;
// WHY: each stream is one more copy of the video over the Pi's uplink; past this the feeds stall for everyone.
const MAX_STREAMS_TOTAL = 12;
// WHY: anyone can sign up as a viewer, so viewers share a smaller pool and the rest stays free for the
// operators who run the gate.
const MAX_VIEWER_STREAMS = 6;
// TECH DEBT: in-process counters; move to Redis when horizontally scaled.
const openStreams = new Map<string, number>();
let totalStreams = 0;
let viewerStreams = 0;

const err = (error: string, status: number) => NextResponse.json({ error }, { status });

/**
 * GET /api/camera/stream?src=<camera> — go2rtc's live fragmented MP4 over plain HTTP.
 * WHY: WebRTC needs a UDP path from the browser to the Pi (ICE/TURN). HTTP video goes through
 * this authenticated same-origin route and nginx like any other request.
 * No Origin check: <video src> sends none. SameSite=Lax keeps the session cookie off cross-site loads.
 */
export async function GET(request: Request) {
  let userId: string;
  let isViewer: boolean;
  try {
    const user = await requireUser();
    userId = user.id;
    isViewer = user.role === "viewer";
  } catch (e) {
    const denied = authErrorResponse(e);
    if (denied) return denied;
    console.error("[API /camera/stream] auth lookup failed:", e instanceof Error ? e.message : "unknown");
    return err("unavailable", 503);
  }
  if (request.headers.get("sec-fetch-site") === "cross-site") return err("forbidden", 403);

  const src = new URL(request.url).searchParams.get("src");
  if (!src || !ALLOWED.has(src)) return err("invalid_src", 400);

  const count = openStreams.get(userId) ?? 0;
  if (count >= MAX_STREAMS_PER_USER) return err("too_many_streams", 429);
  if (totalStreams >= MAX_STREAMS_TOTAL || (isViewer && viewerStreams >= MAX_VIEWER_STREAMS)) {
    return err("camera_busy", 429);
  }
  openStreams.set(userId, count + 1);
  totalStreams++;
  if (isViewer) viewerStreams++;
  let slotFreed = false;
  const freeSlot = () => {
    if (slotFreed) return;
    slotFreed = true;
    totalStreams--;
    if (isViewer) viewerStreams--;
    const left = (openStreams.get(userId) ?? 1) - 1;
    if (left > 0) openStreams.set(userId, left);
    else openStreams.delete(userId);
  };

  const base = (process.env.GO2RTC_URL || "http://127.0.0.1:1984").replace(/\/+$/, "");
  const abort = new AbortController();
  const connectTimer = setTimeout(() => abort.abort(), CONNECT_TIMEOUT_MS);
  let upstream: Response;
  try {
    upstream = await fetch(`${base}/api/stream.mp4?src=${encodeURIComponent(src)}`, {
      redirect: "error",
      signal: abort.signal,
    });
  } catch (e) {
    clearTimeout(connectTimer);
    freeSlot();
    console.error("[API /camera/stream] go2rtc unreachable:", e instanceof Error ? e.name : "unknown");
    return err("camera_unavailable", 502);
  }
  clearTimeout(connectTimer);

  const type = upstream.headers.get("content-type") ?? "";
  if (!upstream.ok || !upstream.body || !type.startsWith("video/mp4")) {
    console.error(`[API /camera/stream] go2rtc returned ${upstream.status} (${type || "no type"}) for ${src}`);
    await upstream.body?.cancel().catch(() => {});
    freeSlot();
    return err("camera_unavailable", 502);
  }

  const reader = upstream.body.getReader();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let finished = false;
  const finish = (closeBody: boolean) => {
    if (finished) return;
    finished = true;
    clearTimeout(lifetimeTimer);
    request.signal.removeEventListener("abort", onClientAbort);
    freeSlot();
    abort.abort();
    reader.cancel().catch(() => {});
    if (closeBody) {
      try {
        controller.close();
      } catch {
        // already closed or cancelled by the client
      }
    }
  };
  const onClientAbort = () => finish(false);
  const lifetimeTimer = setTimeout(() => finish(true), MAX_LIFETIME_MS);
  request.signal.addEventListener("abort", onClientAbort, { once: true });

  const body = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
    async pull(c) {
      const idle = setTimeout(() => finish(true), IDLE_TIMEOUT_MS);
      try {
        const { done, value } = await reader.read();
        if (done) finish(true);
        else if (!finished) c.enqueue(value);
      } catch {
        finish(true); // upstream dropped; the player reconnects
      } finally {
        clearTimeout(idle);
      }
    },
    cancel() {
      finish(false);
    },
  });

  return new Response(body, {
    status: 200,
    headers: { "Content-Type": type, "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
}
