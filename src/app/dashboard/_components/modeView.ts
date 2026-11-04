import type { GateMode } from "@/lib/telemetry/parseStatus";
import type { PillTone } from "@/components/StatePill";

/** A stale reading must never look live: stale or missing mode is always "unknown". */
export function modeView(mode: GateMode | null, stale: boolean): { tone: PillTone; label: string } {
  if (stale || mode === null) return { tone: "unknown", label: "ไม่ทราบโหมด" };
  if (mode === "AUTO") return { tone: "on", label: "อัตโนมัติ" };
  if (mode === "MANUAL") return { tone: "warn", label: "ควบคุมเอง" };
  return { tone: "off", label: "OFF" };
}
