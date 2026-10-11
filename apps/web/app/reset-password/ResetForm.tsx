'use client';

import { useRouter } from 'next/navigation';
import { EyeIcon, EyeSlashIcon } from '@phosphor-icons/react';
import { useId, useState } from 'react';
import { passwordChecks, passwordProblem } from '@oda/shared';

type Status = { kind: 'idle' } | { kind: 'saving' } | { kind: 'error'; message: string };

function PasswordField(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  autoFocus?: boolean;
}) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="text-body-strong text-text">
        {props.label}
      </label>
      <div
        className={`mt-2 flex h-14 items-center rounded-md border bg-white pr-2 focus-within:border-2 focus-within:border-border-strong focus-within:ring-2 focus-within:ring-navy/20 ${
          props.error ? 'border-danger' : 'border-border'
        }`}
      >
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          autoComplete="new-password"
          autoFocus={props.autoFocus}
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          aria-invalid={!!props.error}
          aria-describedby={props.error ? `${id}-error` : undefined}
          className="text-subtitle h-full min-w-0 flex-1 bg-transparent px-4 font-normal outline-none"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          className="text-text-secondary flex h-11 w-11 items-center justify-center"
        >
          {visible ? (
            <EyeSlashIcon size={24} aria-hidden="true" />
          ) : (
            <EyeIcon size={24} aria-hidden="true" />
          )}
        </button>
      </div>
      {props.error ? (
        <p id={`${id}-error`} role="alert" className="text-small text-danger mt-2">
          {props.error}
        </p>
      ) : null}
    </div>
  );
}

export function ResetForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  const problem = passwordProblem(password);
  const mismatch = confirm !== password ? "The passwords don't match." : null;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    if (problem || mismatch) return;
    setStatus({ kind: 'saving' });
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, newPassword: password }),
      });
      if (res.ok) {
        router.replace('/reset-password/done');
        return;
      }
      const body = (await res.json().catch(() => null)) as {
        code?: string;
        message?: string;
      } | null;
      setStatus({
        kind: 'error',
        message:
          body?.code === 'INVALID_TOKEN'
            ? 'This link has expired or was already used. Ask for a new one in the oda app.'
            : (body?.message ?? 'Something went wrong. Please try again.'),
      });
    } catch {
      setStatus({ kind: 'error', message: 'No connection. Check your internet and try again.' });
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col">
      <h1 className="text-headline text-navy text-center">Choose a new password</h1>
      <p className="text-body text-text-secondary mt-3 text-center">
        Enter a new password below to change your password.
      </p>

      <div className="mt-8 flex flex-col gap-5">
        <PasswordField
          label="New password"
          value={password}
          onChange={setPassword}
          error={submitted && problem ? problem : undefined}
          autoFocus
        />
        <ul className="text-small -mt-2 flex flex-col gap-1" aria-label="Password rules">
          {passwordChecks(password).map(({ label, ok }) => {
            return (
              <li key={label} className={ok ? 'text-green' : 'text-text-secondary'} data-ok={ok}>
                {ok ? '✓' : '•'} {label}
              </li>
            );
          })}
        </ul>
        <PasswordField
          label="Re-enter new password"
          value={confirm}
          onChange={setConfirm}
          error={submitted && !problem && mismatch ? mismatch : undefined}
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
        disabled={status.kind === 'saving'}
        className="rounded-pill bg-primary text-button text-text-on-primary mt-8 flex h-14 items-center justify-center disabled:opacity-60"
      >
        {status.kind === 'saving' ? 'Saving…' : 'Reset password'}
      </button>
    </form>
  );
}
