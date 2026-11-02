/** One state word with its dot: colour never carries the meaning alone. */
export type PillTone = "on" | "off" | "warn" | "danger" | "unknown";

const TONE: Record<Exclude<PillTone, "unknown">, { pill: string; dot: string }> = {
  on: { pill: "bg-on-soft text-on", dot: "bg-on" },
  off: { pill: "bg-off-soft text-off", dot: "bg-off" },
  warn: { pill: "bg-warn-soft text-warn", dot: "bg-warn" },
  danger: { pill: "bg-danger-soft text-danger", dot: "bg-danger" },
};

export default function StatePill({ tone, children }: { tone: PillTone; children: React.ReactNode }) {
  if (tone === "unknown") {
    return (
      <span className="pill-unknown">
        <span className="size-2 shrink-0 rounded-full border-[1.5px] border-unknown" aria-hidden="true" />
        {children}
      </span>
    );
  }
  return (
    <span className={`pill ${TONE[tone].pill}`}>
      <span className={`size-2 shrink-0 rounded-full ${TONE[tone].dot}`} aria-hidden="true" />
      {children}
    </span>
  );
}
