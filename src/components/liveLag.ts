// WHY: the HTTP fMP4 pipe is lossless, so any time the <video> does not play becomes backlog that
// never drains on its own. Lag is measured against the lag at the first `playing` event (TTFB +
// first keyframe), so a normal slow start does not cause a reconnect loop.
export const MAX_LAG_S = 8;
// WHY: the baseline is capped. An uncapped baseline turned a held-back start (blocked autoplay, 26 s
// measured) into permanent "normal" lag; capped, anything beyond this counts as being behind.
export const MAX_BASELINE_S = 5;
// Catch-up: play slightly fast while behind, so lag below the reconnect threshold drains too.
export const CATCHUP_START_S = 2;
export const CATCHUP_STOP_S = 0.5;
export const CATCHUP_RATE = 1.25;
// Only speed up with this much media already buffered; otherwise the player just stalls sooner.
const MIN_BUFFER_AHEAD_S = 1;

/** Wall time since the request minus media played, in seconds. */
export function lagSeconds(elapsedSinceRequestS: number, currentTime: number): number {
  return elapsedSinceRequestS - currentTime;
}

/** Lag beyond the (capped) startup baseline, in seconds. */
export function excessLagSeconds(elapsedSinceRequestS: number, currentTime: number, startLagS: number): number {
  return lagSeconds(elapsedSinceRequestS, currentTime) - Math.min(startLagS, MAX_BASELINE_S);
}

export function isTooFarBehind(elapsedSinceRequestS: number, currentTime: number, startLagS: number): boolean {
  return excessLagSeconds(elapsedSinceRequestS, currentTime, startLagS) > MAX_LAG_S;
}

/** playbackRate to use next. Hysteresis between START and STOP keeps it from flapping. */
export function catchUpRate(excessLagS: number, bufferedAheadS: number, currentRate: number): number {
  if (bufferedAheadS < MIN_BUFFER_AHEAD_S || excessLagS < CATCHUP_STOP_S) return 1;
  if (excessLagS > CATCHUP_START_S) return CATCHUP_RATE;
  return currentRate;
}
