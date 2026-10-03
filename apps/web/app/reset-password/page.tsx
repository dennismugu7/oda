import type { Metadata } from 'next';
import { APP_SIGN_IN_URL, AuthShell } from '@/components/AuthShell';
import { resetTokenStatus } from '@/server/auth';
import { ResetForm } from './ResetForm';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Choose a new password · oda',
  robots: { index: false, follow: false },
  // The token is in the URL: never send it to another site.
  referrer: 'no-referrer',
};

// 07: reached from the reset email (06). The token is checked on load, so an old or used
// link says so before the seller types anything.
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token } = await searchParams;
  const value = typeof token === 'string' ? token : '';
  const status = value ? await resetTokenStatus(value) : 'invalid';

  return (
    <AuthShell>
      {status === 'valid' ? (
        <ResetForm token={value} />
      ) : (
        <div className="flex flex-col items-center text-center">
          <h1 className="text-headline text-navy">This link has expired</h1>
          <p className="text-body text-text-secondary mt-3">
            Reset links work for 1 hour and only once. Open the oda app and tap{' '}
            <strong className="text-text font-semibold">Forgot password?</strong> to get a new one.
          </p>
          <a
            href={APP_SIGN_IN_URL}
            className="rounded-pill bg-primary text-button text-text-on-primary mt-8 flex h-14 w-full items-center justify-center"
          >
            Open oda app
          </a>
        </div>
      )}
    </AuthShell>
  );
}
