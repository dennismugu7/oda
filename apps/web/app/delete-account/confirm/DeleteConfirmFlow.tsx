'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type Account = { token: string; shopName: string | null; email: string };

type State =
  | { kind: 'checking' }
  | ({ kind: 'valid' } & Account)
  | ({ kind: 'deleting' } & Account)
  | { kind: 'done' }
  | { kind: 'used' }
  | { kind: 'invalid' }
  | { kind: 'error'; message: string };

type Answer = {
  status?: string;
  shopName?: string | null;
  email?: string;
  error?: { code?: string; message?: string };
} | null;

/** The token from `#token=…`, then removed from the address bar and history. */
function takeTokenFromHash(): string {
  const token = new URLSearchParams(window.location.hash.slice(1)).get('token') ?? '';
  if (window.location.hash) window.history.replaceState(null, '', window.location.pathname);
  return token;
}

async function post(path: string, token: string) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  return { status: res.status, body: (await res.json().catch(() => null)) as Answer };
}

async function check(token: string): Promise<State> {
  if (!token) return { kind: 'invalid' };
  try {
    const { status, body } = await post('/api/delete-account/check', token);
    if (status !== 200) throw new Error(String(status));
    if (body?.status === 'valid') {
      return { kind: 'valid', token, shopName: body.shopName ?? null, email: body.email ?? '' };
    }
    return { kind: body?.status === 'used' ? 'used' : 'invalid' };
  } catch {
    return {
      kind: 'error',
      message: "We couldn't check your link. Check your internet, then open it again.",
    };
  }
}

export function DeleteConfirmFlow() {
  const [state, setState] = useState<State>({ kind: 'checking' });

  useEffect(() => {
    let cancelled = false;
    check(takeTokenFromHash()).then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function confirm() {
    if (state.kind !== 'valid') return;
    const account: Account = { token: state.token, shopName: state.shopName, email: state.email };
    setState({ kind: 'deleting', ...account });
    try {
      const { status, body } = await post('/api/delete-account/confirm', account.token);
      if (status === 200) return setState({ kind: 'done' });
      if (body?.error?.code === 'link_used') return setState({ kind: 'used' });
      if (body?.error?.code === 'link_invalid') return setState({ kind: 'invalid' });
      setState({ kind: 'error', message: body?.error?.message ?? 'Something went wrong.' });
    } catch {
      setState({ kind: 'valid', ...account });
    }
  }

  switch (state.kind) {
    case 'checking':
      return (
        <p role="status" className="text-body text-text-secondary py-16 text-center">
          Checking your link…
        </p>
      );
    case 'valid':
    case 'deleting':
      return (
        <div className="flex flex-col">
          <h1 className="text-headline text-navy text-center">Delete your account?</h1>
          <p className="text-body text-text-secondary mt-3 text-center">
            This deletes the oda account for <strong className="text-text">{state.email}</strong>
            {state.shopName ? (
              <>
                {' '}
                and closes the shop <strong className="text-text">{state.shopName}</strong>
              </>
            ) : null}
            .
          </p>
          <ul className="text-body text-text-secondary bg-surface-muted mt-6 flex list-disc flex-col gap-1 rounded-md py-4 pr-4 pl-8">
            <li>The shop link stops working at once, and you&apos;re signed out everywhere.</li>
            <li>Products, orders, customers, reviews and photos are removed after 30 days.</li>
            <li>This can&apos;t be undone.</li>
          </ul>
          <button
            type="button"
            onClick={confirm}
            disabled={state.kind === 'deleting'}
            className="rounded-pill bg-danger text-button mt-8 flex h-14 items-center justify-center text-white disabled:opacity-60"
          >
            {state.kind === 'deleting' ? 'Deleting…' : 'Delete my account'}
          </button>
          <p className="text-small text-text-secondary mt-4 text-center">
            Changed your mind? Just close this page: nothing changes.
          </p>
        </div>
      );
    case 'done':
      return (
        <Message
          title="Your account is deleted"
          body="Your shop is closed and you're signed out everywhere. Your data is removed within 30 days."
        />
      );
    case 'used':
      return (
        <Message
          title="This link was already used"
          body="The account is already deleted. Nothing more to do."
        />
      );
    case 'invalid':
      return (
        <Message
          title="This link has expired"
          body="Delete links work for 1 hour and only once. Ask for a new one below."
          link
        />
      );
    case 'error':
      return <Message title="Something went wrong" body={state.message} />;
  }
}

function Message({ title, body, link }: { title: string; body: string; link?: boolean }) {
  return (
    <div className="flex flex-col items-center text-center" role="status">
      <h1 className="text-headline text-navy">{title}</h1>
      <p className="text-body text-text-secondary mt-3">{body}</p>
      {link ? (
        <Link
          href="/delete-account"
          className="rounded-pill bg-primary text-button text-text-on-primary mt-8 flex h-14 w-full items-center justify-center"
        >
          Ask for a new link
        </Link>
      ) : null}
    </div>
  );
}
