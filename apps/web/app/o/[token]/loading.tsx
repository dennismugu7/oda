// Shown while an order page loads: grey blocks in its layout (order number, title, status
// card, steps). No data, no scripts.
export default function OrderLoading() {
  return (
    <main className="mx-auto min-h-dvh max-w-md bg-surface px-4 pt-6 pb-16" aria-busy="true">
      <p role="status" className="sr-only">
        Loading…
      </p>
      <div className="animate-pulse" aria-hidden="true">
        <div className="flex justify-between gap-3">
          <div className="h-4 w-24 rounded bg-surface-muted" />
          <div className="h-4 w-28 rounded bg-surface-muted" />
        </div>
        <div className="mt-2 h-8 w-3/4 rounded bg-surface-muted" />
        <div className="mt-5 flex items-center gap-4">
          <div className="size-16 shrink-0 rounded-pill bg-surface-muted" />
          <div className="flex-1 space-y-2">
            <div className="h-6 w-1/2 rounded bg-surface-muted" />
            <div className="h-4 rounded bg-surface-muted" />
          </div>
        </div>
        <div className="mt-5 h-48 rounded-xl bg-surface-muted" />
        <div className="mt-5 h-32 rounded-xl bg-surface-muted" />
      </div>
    </main>
  );
}
