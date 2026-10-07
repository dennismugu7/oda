// Shown while a shop page loads: grey blocks in the shop's layout (header, search, categories,
// product grid). No data, no scripts.
export default function ShopLoading() {
  return (
    <main className="mx-auto min-h-dvh max-w-md bg-surface pb-32" aria-busy="true">
      <p role="status" className="sr-only">
        Loading…
      </p>
      <div className="animate-pulse" aria-hidden="true">
        <div className="flex items-center gap-3 px-4 pt-5">
          <div className="size-16 shrink-0 rounded-pill bg-surface-muted" />
          <div className="flex-1 space-y-2">
            <div className="h-5 w-2/3 rounded bg-surface-muted" />
            <div className="h-4 w-1/2 rounded bg-surface-muted" />
          </div>
          <div className="size-12 shrink-0 rounded-pill bg-surface-muted" />
        </div>
        <div className="mx-4 mt-4 h-12 rounded-pill bg-surface-muted" />
        <div className="mt-5 flex gap-2 px-4">
          {[0, 1, 2].map((n) => (
            <div key={n} className="h-11 w-20 shrink-0 rounded-pill bg-surface-muted" />
          ))}
        </div>
        <div className="mt-5 px-4">
          <div className="h-6 w-28 rounded bg-surface-muted" />
          <div className="mt-3 grid grid-cols-2 gap-3">
            {[0, 1, 2, 3].map((n) => (
              <div key={n}>
                <div className="aspect-square rounded-xl bg-surface-muted" />
                <div className="mt-2 h-4 w-3/4 rounded bg-surface-muted" />
                <div className="mt-1.5 h-4 w-1/3 rounded bg-surface-muted" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
