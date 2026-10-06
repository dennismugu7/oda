'use client';

import { useId, useState } from 'react';

type Status =
  { kind: 'idle' } | { kind: 'sending' } | { kind: 'sent' } | { kind: 'error'; message: string };

export function DeleteRequestForm() {
  const id = useId();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!email.trim()) {
      setStatus({ kind: 'error', message: 'Enter the email you sign in with.' });
      return;
    }
    setStatus({ kind: 'sending' });
    try {
      const res = await fetch('/api/delete-account', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (res.ok) {
        setStatus({ kind: 'sent' });
        return;
      }
      const body = (await res.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setStatus({
        kind: 'error',
        message: body?.error?.message ?? 'Something went wrong. Please try again.',
      });
    } catch {
      setStatus({ kind: 'error', message: 'No connection. Check your internet and try again.' });
    }
  }

  if (status.kind === 'sent') {
    return (
      <div className="flex flex-col items-center text-center" role="status">
        <h1 className="text-headline text-navy">Check your email</h1>
        <p className="text-body text-text-secondary mt-3">
          If this email has an oda account, we&apos;ve sent a link to confirm deleting it. The link
          works for 1 hour. Nothing changes until you open it and confirm.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col">
      <h1 className="text-headline text-navy text-center">Delete your oda account</h1>
      <p className="text-body text-text-secondary mt-3 text-center">
        Enter the email you sign in with. We&apos;ll send you a link to confirm.
      </p>
      <ul className="text-body text-text-secondary bg-surface-muted mt-6 flex list-disc flex-col gap-1 rounded-md py-4 pr-4 pl-8">
        <li>Your shop closes at once: its link stops working.</li>
        <li>Your products, orders, customers, reviews and photos are removed after 30 days.</li>
        <li>This can&apos;t be undone.</li>
      </ul>
      <p className="text-small text-text-secondary mt-3">
        You can also delete your account in the oda app: More → Settings → Delete account.
      </p>
      <div className="mt-6">
        <label htmlFor={id} className="text-body-strong text-text">
          Email
        </label>
        <input
          id={id}
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="border-border text-subtitle focus:border-border-strong mt-2 h-14 w-full rounded-md border bg-white px-4 font-normal outline-none focus:border-2"
        />
      </div>
      {status.kind === 'error' ? (
        <p
          role="alert"
          className="text-body bg-warning-tint text-warning-text-strong mt-6 rounded-md p-4"
        >
          {status.message}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={status.kind === 'sending'}
        className="rounded-pill bg-danger text-button mt-8 flex h-14 items-center justify-center text-white disabled:opacity-60"
      >
        {status.kind === 'sending' ? 'Sending…' : 'Email me the confirm link'}
      </button>
    </form>
  );
}
