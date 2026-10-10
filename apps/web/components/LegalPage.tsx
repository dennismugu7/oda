// /privacy and /terms (M11 CP3, decisions #93 D9, #98): the operator, contact and last-updated
// date in one place; each page writes its own sections.
import Link from 'next/link';
import { HOME_HREF } from '@/lib/home';
import type { ReactNode } from 'react';

export const SUPPORT_EMAIL = 'support@mugu-labs.com';
/** The operator named on both pages (owner, 2026-10-10). */
export const OPERATOR = 'Mugu Labs';

export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  /** "Last updated" date, written out (e.g. "10 October 2026"). */
  updated: string;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto min-h-dvh max-w-md px-5 pt-8 pb-12">
      <Link
        href={HOME_HREF}
        aria-label="oda home"
        className="text-[32px] leading-none font-bold tracking-[-1px] text-navy"
      >
        oda<span className="text-green-bright">.</span>
      </Link>
      <h1 className="mt-6 text-headline text-navy">{title}</h1>
      <p className="mt-1 text-small text-text-secondary">Last updated {updated}</p>
      <div className="mt-4 space-y-6 text-body text-text-secondary [&_h2]:text-title [&_h2]:text-navy [&_h3]:mt-3 [&_h3]:text-body-strong [&_h3]:text-navy [&_li]:mt-1 [&_p]:mt-2 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5">
        {children}
      </div>
      <p className="mt-10 text-small text-text-secondary">
        Questions:{' '}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold text-navy underline">
          {SUPPORT_EMAIL}
        </a>
      </p>
    </main>
  );
}
