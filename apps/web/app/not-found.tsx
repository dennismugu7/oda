// The branded 404 (spec §6.1): unknown, suspended and deleted shops, and any other missing page.
import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
      <p
        role="img"
        aria-label="oda"
        className="text-[44px] leading-none font-bold tracking-[-2px] text-navy"
      >
        oda<span className="text-green-bright">.</span>
      </p>
      <h1 className="mt-8 text-headline text-navy">This page isn&apos;t here</h1>
      <p className="mt-3 text-body text-text-secondary">
        The link may be mistyped, or the shop is no longer on oda. Check the link with the seller.
      </p>
      <Link
        href="/"
        className="mt-8 flex h-12 items-center rounded-pill bg-primary px-6 text-button text-text-on-primary"
      >
        Go to oda
      </Link>
    </main>
  );
}
