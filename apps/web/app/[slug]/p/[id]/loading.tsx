// Shown while a product page loads: grey blocks in its layout (photo, name, price, options,
// the add-to-cart bar). No data, no scripts.
export default function ProductLoading() {
  return (
    <main className="mx-auto min-h-dvh max-w-md bg-surface px-4 pt-4 pb-32" aria-busy="true">
      <p role="status" className="sr-only">
        Loading…
      </p>
      <div className="animate-pulse" aria-hidden="true">
        <div className="aspect-square rounded-xl bg-surface-muted" />
        <div className="mt-4 h-7 w-3/4 rounded bg-surface-muted" />
        <div className="mt-2 h-4 w-1/3 rounded bg-surface-muted" />
        <div className="mt-4 h-9 w-1/2 rounded bg-surface-muted" />
        <div className="mt-6 h-4 w-24 rounded bg-surface-muted" />
        <div className="mt-2 grid grid-cols-4 gap-2">
          {[0, 1, 2, 3].map((n) => (
            <div key={n} className="h-12 rounded-lg bg-surface-muted" />
          ))}
        </div>
        <div className="mt-6 space-y-2">
          <div className="h-4 rounded bg-surface-muted" />
          <div className="h-4 w-5/6 rounded bg-surface-muted" />
        </div>
      </div>
      <div className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md border-t border-border bg-surface px-4 pt-3 pb-4">
        <div className="h-14 animate-pulse rounded-pill bg-surface-muted" />
      </div>
    </main>
  );
}
