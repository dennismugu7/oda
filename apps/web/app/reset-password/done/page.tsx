import type { Metadata } from 'next';
import { APP_SIGN_IN_URL, AuthShell } from '@/components/AuthShell';

export const metadata: Metadata = {
  title: 'Password changed · oda',
  robots: { index: false, follow: false },
};

// 08: after a successful reset. Brand-green tick (the image's orange is a mockup slip,
// docs/design-changes.md), plus a button back into the app.
export default function PasswordChangedPage() {
  return (
    <AuthShell>
      <div className="flex flex-col items-center text-center">
        <svg
          aria-hidden="true"
          viewBox="0 0 96 96"
          className="text-green-bright mb-6 h-24 w-24"
          fill="none"
        >
          <circle cx="48" cy="48" r="44" stroke="currentColor" strokeWidth="6" />
          <path
            d="M29 49l13 13 26-28"
            stroke="currentColor"
            strokeWidth="8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <h1 className="text-headline text-navy">Password changed!</h1>
        <p className="text-subtitle text-text mt-3 font-normal">You&apos;re good to go.</p>
        <p className="text-body text-text-secondary mt-4">
          Sign in with your new password whenever you&apos;re ready. For your safety, oda signed you
          out on every phone.
        </p>
        <a
          href={APP_SIGN_IN_URL}
          className="rounded-pill bg-primary text-button text-text-on-primary mt-8 flex h-14 w-full items-center justify-center"
        >
          Open oda app
        </a>
        <p className="text-small text-text-secondary mt-4">
          Or open the oda app on your phone and sign in.
        </p>
      </div>
    </AuthShell>
  );
}
