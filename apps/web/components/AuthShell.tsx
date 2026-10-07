// Layout for the account pages a seller reaches from an email (designs 07, 08): the
// wordmark and tagline on the page background, then a white card with the content.

export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <p
      role="img"
      aria-label="oda"
      className={`text-primary leading-none font-bold tracking-[-3px] ${className}`}
    >
      oda<span className="text-green-bright">.</span>
    </p>
  );
}

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-background min-h-dvh">
      <main className="mx-auto flex max-w-md flex-col">
        <header className="flex flex-col items-center gap-3 px-4 pt-12 pb-10">
          <Wordmark className="text-[56px]" />
          <p className="text-body text-text-secondary tracking-[2px]">Your free shop link</p>
        </header>
        <section className="bg-surface px-4 pt-8 pb-10 sm:rounded-xl">{children}</section>
      </main>
    </div>
  );
}

/** Opens the seller app (scheme `oda`, apps/seller/app.config.ts) on its sign-in screen. */
export const APP_SIGN_IN_URL = 'oda://sign-in';
