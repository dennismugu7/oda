'use client';

import { useEffect, useRef, useState } from 'react';
import { APP_SIGN_IN_URL } from '@/components/AuthShell';
import { ResetForm } from './ResetForm';

type State =
  | { kind: 'checking' }
  | { kind: 'valid'; token: string }
  | { kind: 'invalid' }
  | { kind: 'error'; offline: boolean };

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

/** Checks the token; `offline` when the request got no answer at all. */
async function stateFor(token: string): Promise<State> {
  try {
    const status = await checkToken(token);
    return status === 'valid' ? { kind: 'valid', token } : { kind: 'invalid' };
  } catch (e) {
    return { kind: 'error', offline: e instanceof TypeError };
  }
}

export function ResetFlow() {
  const [state, setState] = useState<State>({ kind: 'checking' });
  // The token is gone from the address bar: keep it in memory for "Try again".
  const token = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    token.current ??= takeTokenFromHash();
    stateFor(token.current).then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function recheck() {
    setState({ kind: 'checking' });
    setState(await stateFor(token.current ?? ''));
  }

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
          body={
            state.offline
              ? 'No connection. Check your internet and try again.'
              : 'We couldn’t check your link. Please try again.'
          }
          onRetry={recheck}
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

function Message({
  title,
  body,
  onRetry,
}: {
  title: string;
  body: React.ReactNode;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center text-center">
      <h1 className="text-headline text-navy">{title}</h1>
      <p className="text-body text-text-secondary mt-3">{body}</p>
      {onRetry ? (
        <>
          <button
            type="button"
            onClick={onRetry}
            className="rounded-pill bg-primary text-button text-text-on-primary mt-8 flex h-14 w-full items-center justify-center"
          >
            Try again
          </button>
          <a
            href={APP_SIGN_IN_URL}
            className="text-body-strong text-navy mt-4 inline-flex min-h-11 items-center underline"
          >
            Open oda app
          </a>
        </>
      ) : (
        <a
          href={APP_SIGN_IN_URL}
          className="rounded-pill bg-primary text-button text-text-on-primary mt-8 flex h-14 w-full items-center justify-center"
        >
          Open oda app
        </a>
      )}
    </div>
  );
}
