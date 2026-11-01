import { describe, it, expect } from "vitest";
import { catchUpRate, CATCHUP_RATE, excessLagSeconds, isTooFarBehind, lagSeconds, MAX_BASELINE_S, MAX_LAG_S } from "./liveLag";

describe("liveLag", () => {
  it("lagSeconds is wall time minus media time", () => {
    expect(lagSeconds(60, 55)).toBe(5);
  });
  it("slow startup alone never triggers (no reconnect loop)", () => {
    // 12 s to first frame through the proxy, then playing in sync
    expect(isTooFarBehind(12, 0, 12)).toBe(false);
    expect(isTooFarBehind(72, 60, 12)).toBe(false);
  });
  it("in sync after a normal start", () => {
    expect(isTooFarBehind(60, 55.6, 4.4)).toBe(false);
  });
  it("rebuffers adding more than MAX_LAG_S trigger", () => {
    expect(isTooFarBehind(60, 60 - 4.4 - MAX_LAG_S - 0.1, 4.4)).toBe(true);
  });
  it("exactly MAX_LAG_S of added lag does not trigger", () => {
    expect(isTooFarBehind(4.4 + MAX_LAG_S, 0, 4.4)).toBe(false);
  });
  it("a held-back start (blocked autoplay, measured 26 s + startup) triggers", () => {
    expect(isTooFarBehind(31, 0, 31)).toBe(true);
  });
  it("a slow start up to the cap is baseline; beyond it, the extra counts as lag", () => {
    expect(excessLagSeconds(4, 0, 4)).toBe(0);
    expect(excessLagSeconds(20, 0, 20)).toBe(20 - MAX_BASELINE_S);
  });
  it("a 26 s held-back start reconnects instead of becoming the new normal", () => {
    expect(isTooFarBehind(26, 0, 26)).toBe(true);
  });
  it("12 s startup through the proxy does not loop", () => {
    expect(isTooFarBehind(12, 0, 12)).toBe(false);
  });
});

describe("catchUpRate", () => {
  it("speeds up when behind with media buffered", () => {
    expect(catchUpRate(3, 2, 1)).toBe(CATCHUP_RATE);
  });
  it("keeps the current rate inside the hysteresis band", () => {
    expect(catchUpRate(1, 2, CATCHUP_RATE)).toBe(CATCHUP_RATE);
    expect(catchUpRate(1, 2, 1)).toBe(1);
  });
  it("back to 1x once caught up", () => {
    expect(catchUpRate(0.2, 2, CATCHUP_RATE)).toBe(1);
  });
  it("never speeds up on an almost empty buffer (would only stall sooner)", () => {
    expect(catchUpRate(5, 0.5, CATCHUP_RATE)).toBe(1);
  });
});
