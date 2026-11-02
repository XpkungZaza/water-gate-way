import { describe, it, expect } from "vitest";
import { JUMP_IF_BEHIND_S, KEEP_BEHIND_S, LIVE_TARGET_S, liveEdgeAction } from "./liveEdge";

describe("liveEdgeAction", () => {
  it("does nothing without buffered media", () => {
    expect(liveEdgeAction(null)).toEqual({ seekTo: null, trimBefore: null });
  });

  it("first data: playhead before the buffered range jumps to just behind the live edge", () => {
    // go2rtc fragments do not start at 0, so a fresh element sits outside the buffered range.
    expect(liveEdgeAction({ start: 12, end: 13, currentTime: 0 }).seekTo).toBeCloseTo(13 - LIVE_TARGET_S);
  });

  it("a short buffer never seeks before its own start", () => {
    expect(liveEdgeAction({ start: 12, end: 12.1, currentTime: 0 }).seekTo).toBe(12);
  });

  it("stays put while close to the live edge", () => {
    expect(liveEdgeAction({ start: 0, end: 5, currentTime: 5 - JUMP_IF_BEHIND_S + 0.1 }).seekTo).toBeNull();
  });

  it("jumps back to the live edge once it falls behind (a stall, a hidden tab, a slow decoder)", () => {
    expect(liveEdgeAction({ start: 0, end: 20, currentTime: 15 }).seekTo).toBeCloseTo(20 - LIVE_TARGET_S);
  });

  it("trims media older than KEEP_BEHIND_S once the buffer grows past it, never at the playhead", () => {
    const a = liveEdgeAction({ start: 0, end: 30, currentTime: 29.7 });
    expect(a.trimBefore).toBeCloseTo(30 - KEEP_BEHIND_S);
    expect(a.trimBefore!).toBeLessThan(29.7);
  });

  it("does not trim a buffer that is still short (avoids a remove on every append)", () => {
    expect(liveEdgeAction({ start: 0, end: KEEP_BEHIND_S + 1, currentTime: KEEP_BEHIND_S + 0.7 }).trimBefore).toBeNull();
  });
});
