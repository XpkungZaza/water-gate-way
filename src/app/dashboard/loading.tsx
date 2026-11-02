/* Skeleton of the live dashboard's shape (title row, two panels, control rail).
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

      <main className="mx-auto w-full max-w-[1376px] flex-1 px-4 pt-6 pb-12 sm:px-6 lg:px-8">
        {/* Title row */}
        <div className="mb-6" aria-hidden="true">
          <div className={`${block} h-7 w-56`} />
          <div className={`${block} mt-3 h-4 w-72 max-w-full`} />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_384px]">
          <div className="flex min-w-0 flex-col gap-6">
            {/* Water level panel: gauge column + chart block */}
            <section aria-hidden="true" className="rounded-lg border border-border bg-surface p-4 sm:p-5">
              <div className={`${block} mb-4 h-5 w-24`} />
              <div className="grid grid-cols-1 gap-8 md:grid-cols-[auto_minmax(0,1fr)]">
                <div className={`${block} h-60 w-[72px]`} />
                <div className={`${block} h-60 min-w-0`} />
              </div>
            </section>
            {/* Readings panel: four cells in two columns */}
            <section aria-hidden="true" className="rounded-lg border border-border bg-surface p-4 sm:p-5">
              <div className={`${block} mb-4 h-5 w-28`} />
              <div className="grid grid-cols-1 gap-x-10 gap-y-6 sm:grid-cols-2">
                {Array.from({ length: 4 }, (_, i) => (
                  <div key={i} className="flex items-center justify-between gap-4">
                    <div className={`${block} h-4 w-24`} />
                    <div className={`${block} h-6 w-20`} />
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Control rail */}
          <aside aria-hidden="true" className="min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1">
            <div className="rounded-lg border border-border bg-surface">
              <div className="border-b border-border px-4 py-3">
                <div className={`${block} h-5 w-32`} />
              </div>
              <div className="divide-y divide-rule px-4">
                {Array.from({ length: 5 }, (_, i) => (
                  <div key={i} className="py-3.5">
                    <div className="flex items-center justify-between gap-3">
                      <div className={`${block} h-5 w-28`} />
                      <div className={`${block} h-8 w-28 rounded-full`} />
                    </div>
                    <div className="mt-2.5 grid grid-cols-2 gap-2">
                      <div className={`${block} h-12`} />
                      <div className={`${block} h-12`} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
