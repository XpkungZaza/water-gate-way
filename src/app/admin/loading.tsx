/* Skeleton of the admin frame's shape (app bar, section tabs, title row, two panels).
   Flat static blocks: no shimmer, no animation — the real content swaps in when streamed. */
const block = "rounded bg-surface-2";

export default function Loading() {
  return (
    <div role="status" aria-busy="true" className="flex min-h-dvh flex-col bg-bg">
      <span className="sr-only">กำลังโหลด</span>
      {/* App bar */}
      <div className="flex h-12 shrink-0 items-center border-b border-border bg-surface px-4 sm:px-6">
        <div className={`${block} h-6 w-28`} aria-hidden="true" />
      </div>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-4 pb-12 sm:px-6">
        {/* Section tabs */}
        <div aria-hidden="true" className="flex gap-3 border-b border-border pb-3">
          <div className={`${block} h-6 w-20`} />
          <div className={`${block} h-6 w-16`} />
          <div className={`${block} h-6 w-24`} />
        </div>

        {/* Title row */}
        <div className="mt-6 mb-6" aria-hidden="true">
          <div className={`${block} h-7 w-40`} />
          <div className={`${block} mt-2 h-4 w-56 max-w-full`} />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {Array.from({ length: 2 }, (_, i) => (
            <section key={i} aria-hidden="true" className="rounded-lg border border-border bg-surface">
              <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
                <div className={`${block} h-5 w-24`} />
                <div className={`${block} h-5 w-20`} />
              </div>
              <div className="grid grid-cols-2 divide-rule sm:grid-cols-4 sm:divide-x">
                {Array.from({ length: 4 }, (_, j) => (
                  <div key={j} className="px-5 py-4">
                    <div className={`${block} h-4 w-14`} />
                    <div className={`${block} mt-2 h-7 w-10`} />
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
