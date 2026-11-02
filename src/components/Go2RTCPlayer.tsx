"use client";

import { useEffect, useRef, useState } from "react";
import { catchUpRate, excessLagSeconds, isTooFarBehind } from "./liveLag";

interface Go2RTCPlayerProps {
  streamName: string;
  label?: string;
}

type Status = "connecting" | "connected" | "failed";

// WHY: a frozen picture must not stay labelled LIVE. Progressive MP4 gives no error when the
// camera drops, so playback progress is the only signal.
const STALL_MS = 8_000;
// WHY: a request that never reaches `playing` (headers then silence, a hung proxy) used to spin forever.
const CONNECT_TIMEOUT_MS = 15_000;
// Automatic retries before showing "failed"; the manual retry button resets the count.
const MAX_FAILURES = 3;
const RETRY_DELAY_MS = 2_000;
// WHY: if every fresh connection starts slow, lag reconnects would loop; one per 30 s at most.
const LAG_RECONNECT_MIN_MS = 30_000;
const DEV = process.env.NODE_ENV !== "production";

export default function Go2RTCPlayer({ streamName, label }: Go2RTCPlayerProps) {
  const [status, setStatus] = useState<Status>("connecting");
  // Bumping `attempt` remounts <video>, which opens a fresh HTTP stream.
  const [attempt, setAttempt] = useState(0);
  // WHY: hidden tab drops the <video> so the server stream closes and frees its slot.
  const [hidden, setHidden] = useState(false);
  const lastProgress = useRef(0);
  const requestedAt = useRef(0);
  const startLag = useRef<number | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const failures = useRef(0);
  const lastLagReconnect = useRef(0);

  const reconnect = () => {
    setStatus("connecting");
    setAttempt((n) => n + 1);
  };
  const retry = () => {
    failures.current = 0;
    reconnect();
  };
  const fail = () => {
    failures.current += 1;
    if (failures.current >= MAX_FAILURES) {
      setStatus("failed");
      return;
    }
    setStatus("connecting");
    setTimeout(() => setAttempt((n) => n + 1), RETRY_DELAY_MS);
  };

  useEffect(() => {
    requestedAt.current = performance.now();
    startLag.current = null;
  }, [attempt]);

  useEffect(() => {
    const onVisibilityChange = () => {
      const isHidden = document.visibilityState === "hidden";
      setHidden(isHidden);
      if (!isHidden) {
        failures.current = 0;
        setStatus("connecting");
        setAttempt((n) => n + 1);
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  // Connect timeout: no `playing` within 15 s counts as a failed attempt.
  useEffect(() => {
    if (status !== "connecting" || hidden) return;
    const id = setTimeout(fail, CONNECT_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [status, hidden, attempt]);

  useEffect(() => {
    if (status !== "connected" || hidden) return;
    const id = setInterval(() => {
      const v = videoRef.current;
      const stalled = Date.now() - lastProgress.current > STALL_MS;
      let behind = false;
      if (v && startLag.current !== null) {
        const elapsed = (performance.now() - requestedAt.current) / 1000;
        // WHY: the HTTP pipe is lossless, so time not played becomes backlog that never drains by
        // itself. Seeking cannot reach it (it sits upstream); playing faster pulls it through.
        const ahead = v.buffered.length ? v.buffered.end(v.buffered.length - 1) - v.currentTime : 0;
        v.playbackRate = catchUpRate(excessLagSeconds(elapsed, v.currentTime, startLag.current), ahead, v.playbackRate);
        behind =
          isTooFarBehind(elapsed, v.currentTime, startLag.current) &&
          Date.now() - lastLagReconnect.current > LAG_RECONNECT_MIN_MS;
        if (behind) lastLagReconnect.current = Date.now();
      }
      if (stalled || behind) {
        if (DEV) console.debug(`[camera] ${streamName} reconnect: ${stalled ? "stalled" : "behind"}`);
        reconnect();
      }
    }, 2_000);
    return () => clearInterval(id);
  }, [status, hidden, streamName]);

  // WHY: go2rtc's fragmented MP4 over HTTP through the authenticated same-origin proxy, so it needs
  // no WebRTC/ICE and works from any network. The server ends each stream after 10 minutes
  // (session re-check); `ended` then reconnects.
  const src = `/api/camera/stream?src=${encodeURIComponent(streamName)}&n=${attempt}`;
  // WHY: labels come from the grid position (กล้อง 1, กล้อง 2, …); the fallback never shows a raw
  // stream id to users.
  const displayLabel = label ?? "กล้อง";

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      {!hidden && (
        <video
          ref={videoRef}
          key={attempt}
          src={src}
          autoPlay
          playsInline
          muted
          className="h-full w-full object-cover"
          onPlaying={(e) => {
            lastProgress.current = Date.now();
            if (startLag.current === null) {
              startLag.current = (performance.now() - requestedAt.current) / 1000 - e.currentTarget.currentTime;
              if (DEV) console.debug(`[camera] ${streamName} start lag ${startLag.current.toFixed(1)} s`);
            }
            failures.current = 0;
            setStatus("connected");
          }}
          onTimeUpdate={() => {
            lastProgress.current = Date.now();
          }}
          onError={fail}
          onEnded={() => setTimeout(reconnect, 1_000)}
        />
      )}

      {/* Status: dot + word (never colour alone). z-10 keeps both chips readable above the
          connecting/failed overlays instead of dimmed underneath them. */}
      <div className="absolute top-3 left-3 z-10 flex items-center gap-2">
        <span
          aria-hidden="true"
          className={`size-2.5 rounded-full ${
            status === "connected" ? "bg-on" : status === "failed" ? "bg-danger" : "bg-warn"
          }`}
        />
        <span className="text-xs font-bold text-white">
          {status === "connected" ? "สด" : status === "failed" ? "ออฟไลน์" : "กำลังเชื่อมต่อ"}
        </span>
      </div>

      {/* Camera label: small white chip */}
      <div className="absolute bottom-3 left-3 z-10 rounded-md bg-white px-2 py-1">
        <span className="text-xs font-bold text-fg">{displayLabel}</span>
      </div>

      {/* Loading */}
      {status === "connecting" && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60">
          <div className="size-8 rounded-full border-2 border-white/80 border-t-transparent animate-spin" />
        </div>
      )}

      {/* Error. WHY: centred with side padding so the heading clears the status chip at 375px and
          at the 2-up desktop width; secondary (outline) styling stays readable on black. */}
      {status === "failed" && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 px-4">
          <div className="flex max-w-full flex-col items-center gap-3 text-center">
            <p className="text-sm font-bold text-white">เชื่อมต่อกล้องไม่สำเร็จ</p>
            <button
              onClick={retry}
              className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-md border border-white/40 bg-transparent px-4 text-sm font-bold text-white transition-colors duration-150 hover:bg-white/10"
            >
              ลองอีกครั้ง
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
