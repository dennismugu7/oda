'use client'; // Error boundaries must be Client Components

// The branded error state for every page (CLAUDE.md: every screen handles errors): a short
// explanation and "Try again", which re-fetches the page (Next 16's retry()).
import Link from 'next/link';
import { HOME_HREF } from '@/lib/home';

export default function ErrorPage({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
      <p
        role="img"
        aria-label="oda"
        className="text-[44px] leading-none font-bold tracking-[-2px] text-primary"
      >
        oda<span className="text-green-bright">.</span>
      </p>
      <h1 className="mt-8 text-headline text-navy">Something went wrong</h1>
      <p className="mt-3 text-body text-text-secondary">
        This page didn’t load. Check your connection and try again.
      </p>
      <button
        type="button"
        onClick={() => retry()}
        className="mt-8 flex h-12 items-center rounded-pill bg-primary px-6 text-button text-text-on-primary"
      >
        Try again
      </button>
      <Link
        href={HOME_HREF}
        className="mt-2 inline-flex min-h-11 items-center text-body-strong text-navy underline"
      >
        Go to oda
      </Link>
    </main>
  );
}
