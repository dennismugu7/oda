// /privacy and /terms (M4): placeholder text, clearly marked for replacement before launch
// (owner Step 63). Only the structure and a few facts are real.
import Link from 'next/link';
import type { ReactNode } from 'react';

export const SUPPORT_EMAIL = 'support@mugu-labs.com';

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto min-h-dvh max-w-md px-5 pt-8 pb-12">
      <Link
        href="/"
        aria-label="oda home"
        className="text-[32px] leading-none font-bold tracking-[-1px] text-navy"
      >
        oda<span className="text-green-bright">.</span>
      </Link>
      <p
        role="note"
        className="mt-6 rounded-lg border border-warning-accent bg-warning-tint p-4 text-body-strong text-warning-text-strong"
      >
        Placeholder — to be replaced before launch. This page is a draft, not oda&apos;s final legal
        text.
      </p>
      <h1 className="mt-6 text-headline text-navy">{title}</h1>
      <div className="mt-4 space-y-6 text-body text-text-secondary [&_h2]:text-title [&_h2]:text-navy [&_p]:mt-2">
        {children}
      </div>
      <p className="mt-10 text-small text-text-muted">
        Questions:{' '}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold text-navy underline">
          {SUPPORT_EMAIL}
        </a>
      </p>
    </main>
  );
}
