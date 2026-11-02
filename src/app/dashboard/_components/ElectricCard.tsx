import type { GateStatus } from "@/lib/telemetry/parseStatus";
import Reading from "./Reading";

const ROWS = [
  { key: "voltage", label: "แรงดัน", digits: 1, unit: "V" },
  { key: "current", label: "กระแส", digits: 2, unit: "A" },
  { key: "frequency", label: "ความถี่", digits: 2, unit: "Hz" },
  { key: "power", label: "กำลังไฟ", digits: 1, unit: "W" },
] as const;

/** Voltage, current, frequency and power from the PZEM meter, as one definition list. */
export default function ElectricCard({ pzem, live }: { pzem: GateStatus["pzem"] | null; live: boolean }) {
  // WHY: stale readings stay visible but muted, so an old value is never mistaken for a live one.
  const c = live ? "text-fg" : "text-muted";
  return (
    <section aria-labelledby="electric-heading">
      <h3 id="electric-heading" className="text-sm font-bold text-fg">
        ไฟฟ้า (PZEM)
      </h3>
      <dl className="mt-2">
        {ROWS.map((r) => (
          <div key={r.key} className="flex items-baseline justify-between gap-4 py-1.5">
            <dt className="text-sm text-muted">{r.label}</dt>
            <dd>
              <Reading value={pzem?.[r.key] ?? null} digits={r.digits} unit={r.unit} color={c} />
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
