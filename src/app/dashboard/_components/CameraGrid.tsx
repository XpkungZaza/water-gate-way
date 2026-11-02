import Go2RTCPlayer from "@/components/Go2RTCPlayer";
import { CAMERAS } from "@/lib/gates";

/** The camera feeds. WHY: the column count follows the camera count (3 across from 640px), so no cell is orphaned. */
export default function CameraGrid() {
  return (
    <section aria-labelledby="cameras-heading" className="rounded-lg border border-border bg-surface p-4 sm:p-5">
      <h2 id="cameras-heading" className="mb-3 text-base font-bold text-fg">
        กล้องสด
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {/* WHY: labelled by position (กล้อง 1…), never by the raw stream id. */}
        {CAMERAS.map((src, i) => (
          <div key={src} id={`camera-stream-${src}`} className="aspect-video overflow-hidden rounded-md bg-black">
            <Go2RTCPlayer streamName={src} label={`กล้อง ${i + 1}`} />
          </div>
        ))}
      </div>
    </section>
  );
}
