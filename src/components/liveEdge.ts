// Live-edge control for the MSE camera player. With MSE the lag is measured directly
// (buffered end minus playhead), so there is no wall-clock model to guess it.

/** Where to sit behind the newest buffered frame: enough for one late fragment, no more. */
export const LIVE_TARGET_S = 0.3;
/** Further behind than this (a stall, a hidden tab, a slow decoder), jump back to the live edge. */
export const JUMP_IF_BEHIND_S = 1.5;
/** Media kept behind the live edge; older media is removed so memory stays flat over a 10-minute stream. */
export const KEEP_BEHIND_S = 10;
// WHY: trim only once the buffer is this much longer than KEEP_BEHIND_S, not on every append.
const TRIM_SLACK_S = 2;

export type Buffered = { start: number; end: number; currentTime: number };
export type LiveEdgeAction = { seekTo: number | null; trimBefore: number | null };

export function liveEdgeAction(b: Buffered | null): LiveEdgeAction {
  if (!b || b.end <= b.start) return { seekTo: null, trimBefore: null };
  const target = Math.max(b.start, b.end - LIVE_TARGET_S);
  const outside = b.currentTime < b.start || b.currentTime > b.end;
  const seekTo = outside || b.end - b.currentTime > JUMP_IF_BEHIND_S ? target : null;
  const trimBefore = b.end - b.start > KEEP_BEHIND_S + TRIM_SLACK_S ? b.end - KEEP_BEHIND_S : null;
  return { seekTo, trimBefore };
}
