'use client';

import { useEffect, useState } from 'react';
import { APP_SIGN_IN_URL } from '@/components/AuthShell';
import { ResetForm } from './ResetForm';

type State =
  { kind: 'checking' } | { kind: 'valid'; token: string } | { kind: 'invalid' } | { kind: 'error' };

/** The token from `#token=…`, then removed from the address bar and history. */
function takeTokenFromHash(): string {
  const token = new URLSearchParams(window.location.hash.slice(1)).get('token') ?? '';
  if (window.location.hash) {
    window.history.replaceState(null, '', window.location.pathname);
  }
  return token;
}

async function checkToken(token: string): Promise<'valid' | 'invalid'> {
  if (!token) return 'invalid';
  const res = await fetch('/api/reset-password/check', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  if (!res.ok) throw new Error(String(res.status));
  return ((await res.json()) as { status: 'valid' | 'invalid' }).status;
}

export function ResetFlow() {
  const [state, setState] = useState<State>({ kind: 'checking' });

  useEffect(() => {
    const token = takeTokenFromHash();
    checkToken(token)
      .then((status) =>
        setState(status === 'valid' ? { kind: 'valid', token } : { kind: 'invalid' }),
      )
      .catch(() => setState({ kind: 'error' }));
  }, []);

  switch (state.kind) {
    case 'checking':
      return (
        <p role="status" className="text-body text-text-secondary py-16 text-center">
          Checking your link…
        </p>
      );
    case 'valid':
      return <ResetForm token={state.token} />;
    case 'error':
      return (
        <Message
          title="Something went wrong"
          body="We couldn't check your link. Check your internet, then open the link from the email again."
        />
      );
    case 'invalid':
      return (
        <Message
          title="This link has expired"
          body={
            <>
              Reset links work for 1 hour and only once. Open the oda app and tap{' '}
              <strong className="text-text font-semibold">Forgot password?</strong> to get a new
              one.
            </>
          }
        />
      );
  }
}

function Message({ title, body }: { title: string; body: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center text-center">
      <h1 className="text-headline text-navy">{title}</h1>
      <p className="text-body text-text-secondary mt-3">{body}</p>
      <a
        href={APP_SIGN_IN_URL}
        className="rounded-pill bg-primary text-button text-text-on-primary mt-8 flex h-14 w-full items-center justify-center"
      >
        Open oda app
      </a>
    </div>
  );
}
