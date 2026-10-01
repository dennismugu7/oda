// Placeholder landing page for M0. The real landing page ("what oda is" + Get the app) is M4.
export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pt-12 pb-6">
      <div className="flex flex-col items-center gap-3 pt-8 text-center">
        <p
          aria-label="oda"
          className="text-[64px] leading-none font-bold tracking-[-3px] text-primary"
        >
          oda<span className="text-green-bright">.</span>
        </p>
        <p className="text-title font-medium text-text-secondary">Your free shop link</p>
      </div>

      <section className="mt-12 rounded-xl bg-primary-tint p-6">
        <h1 className="text-headline text-navy">Turn your posts into orders.</h1>
        <p className="mt-2 text-body text-text-secondary">
          Share one link on WhatsApp, TikTok and Instagram. Buyers pay you directly on M-Pesa.
        </p>
      </section>

      <div className="mt-auto flex flex-col gap-3 pt-8">
        <span className="flex h-12 items-center justify-center rounded-pill bg-primary text-button text-text-on-primary">
          Coming soon to Android
        </span>
        <span className="flex h-12 items-center justify-center rounded-pill bg-green-tint text-body-strong text-green">
          Pay the seller directly on M-Pesa
        </span>
      </div>
    </main>
  );
}
