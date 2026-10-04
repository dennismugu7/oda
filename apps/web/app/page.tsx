// Landing page `/` (M4; wording drafted for the owner's review at review stop A). The store
// button is config-driven: with APP_DOWNLOAD_URL set (a public https link) it becomes a real
// download button; without it, a "Coming soon to Google Play" placeholder (decision #59).
import type { Metadata } from 'next';
import Link from 'next/link';
import { isPublicBaseUrl } from '@oda/shared';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'oda · Turn your posts into orders',
  description:
    'A free shop link for WhatsApp, TikTok and Instagram sellers in Kenya. Buyers order in a few taps and pay you directly on M-Pesa.',
};

const SUPPORT_EMAIL = 'support@mugu-labs.com';

const POINTS = [
  {
    title: 'Ready in minutes',
    body: 'Add a photo and a price, and your shop link is ready to share.',
  },
  {
    title: 'Orders, not DMs',
    body: 'Buyers pick the size, colour and delivery themselves. You get a clear order.',
  },
  {
    title: 'Your money comes straight to you',
    body: 'Buyers pay your till, Pochi la Biashara or Paybill. oda never touches your money.',
  },
  {
    title: 'Free to start',
    body: 'One link for your WhatsApp Status, TikTok bio and Instagram.',
  },
];

function downloadUrl(): string | null {
  const url = process.env.APP_DOWNLOAD_URL?.trim();
  return url && isPublicBaseUrl(url) ? url : null;
}

export default function Home() {
  const download = downloadUrl();
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pt-10 pb-8">
      <p
        aria-label="oda"
        className="text-[44px] leading-none font-bold tracking-[-2px] text-primary"
      >
        oda<span className="text-green-bright">.</span>
      </p>

      <section className="mt-10">
        <h1 className="text-display text-navy">Turn your posts into orders.</h1>
        <p className="mt-3 text-subtitle font-normal text-text-secondary">
          A free shop link for WhatsApp, TikTok and Instagram. Buyers order in a few taps and pay
          you directly on M-Pesa.
        </p>
      </section>

      <div className="mt-8">
        {download ? (
          <a
            href={download}
            className="flex h-14 items-center justify-center rounded-pill bg-primary text-button text-text-on-primary"
          >
            Get the oda app
          </a>
        ) : (
          <p
            aria-disabled="true"
            className="flex h-14 items-center justify-center rounded-pill bg-surface-muted text-button text-text-secondary"
          >
            Coming soon to Google Play
          </p>
        )}
        <p className="mt-2 text-center text-small text-text-secondary">For Android phones.</p>
      </div>

      <ul className="mt-10 space-y-3">
        {POINTS.map((p) => (
          <li key={p.title} className="rounded-xl bg-background p-5">
            <h2 className="text-subtitle text-navy">{p.title}</h2>
            <p className="mt-1 text-body text-text-secondary">{p.body}</p>
          </li>
        ))}
      </ul>

      <footer className="mt-auto pt-12 text-center text-small text-text-secondary">
        <p>
          Questions?{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold text-navy underline">
            {SUPPORT_EMAIL}
          </a>
        </p>
        <p className="mt-2 flex justify-center gap-4">
          <Link href="/privacy" className="underline">
            Privacy
          </Link>
          <Link href="/terms" className="underline">
            Terms
          </Link>
        </p>
      </footer>
    </main>
  );
}
