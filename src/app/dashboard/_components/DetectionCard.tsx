import StatePill from "@/components/StatePill";

/** Person detection count; a detection is a warning, so "พบคน" uses the warn tone. */
export default function DetectionCard({ personCount, live = true }: { personCount: number | null; live?: boolean }) {
  const unknown = personCount === null || !live;
  const seen = !unknown && personCount > 0;
  return (
    <section aria-labelledby="detection-heading">
      <h3 id="detection-heading" className="text-sm font-bold text-fg">
        การตรวจจับคน
      </h3>
      <dl className="mt-2">
        <div className="flex items-center justify-between gap-4 py-1.5">
          <dt className="text-sm text-muted">จำนวนที่ตรวจพบ</dt>
          <dd className={`text-base font-bold tabular-nums ${unknown ? "text-muted" : seen ? "text-warn" : "text-fg"}`}>
            {unknown ? "—" : personCount}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-4 py-1.5">
          <dt className="text-sm text-muted">สถานะ</dt>
          <dd>
            {unknown ? (
              <StatePill tone="unknown">ไม่ทราบสถานะ</StatePill>
            ) : seen ? (
              <StatePill tone="warn">พบคน</StatePill>
            ) : (
              <StatePill tone="off">ไม่พบคน</StatePill>
            )}
          </dd>
        </div>
      </dl>
    </section>
  );
}
