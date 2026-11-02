/** Water level thresholds in metres. One source for the gauge and the 24-hour chart. */
export const LEVEL_WARN_M = 3;
export const LEVEL_DANGER_M = 5;
/** Top of the gauge and of the chart's y-axis. */
export const LEVEL_MAX_M = 8;

export type LevelBand = "normal" | "warn" | "danger";

export function levelBand(m: number): LevelBand {
  if (m >= LEVEL_DANGER_M) return "danger";
  if (m >= LEVEL_WARN_M) return "warn";
  return "normal";
}

export const BAND_LABEL: Record<LevelBand, string> = {
  normal: "ปกติ",
  warn: "ระดับเตือน",
  danger: "ระดับอันตราย",
};
