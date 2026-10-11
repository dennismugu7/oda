'use client';

// The buyer's actions on /o/{token} (M5 CP3): the pay page (04b redesign: exact M-Pesa steps
// with copy buttons, paste the SMS or code with live extraction, I've paid, Pay on delivery
// instead, Cancel order), the cancel card (6), and Report a problem. Every action goes to
// /api/o/:token/* (transitionOrder() on the server); the page then reloads its data.
import { useRouter } from 'next/navigation';
import { ShieldWarningIcon } from '@phosphor-icons/react';
import { useRef, useState, useTransition } from 'react';
import { extractMpesaCode, formatKePhone, formatKsh } from '@oda/shared';

type Result = { ok: true } | { ok: false; message: string };

async function post(path: string, body: unknown = {}): Promise<Result> {
  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) return { ok: true };
    const data = await res.json().catch(() => null);
    return {
      ok: false,
      message: data?.error?.message ?? 'Something went wrong. Please try again.',
    };
  } catch {
    return { ok: false, message: 'No connection. Check your internet and try again.' };
  }
}

/**
 * Runs an order action, then reloads the page's data from the server. `busy` stays set until
 * the reload has finished, so a button can't be tapped twice in between.
 */
function useAction(token: string) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  // A double tap lands before React re-renders the disabled button.
  const inFlight = useRef(false);
  async function run(action: 'code' | 'switch-to-pod' | 'cancel', body?: unknown) {
    if (inFlight.current) return false;
    inFlight.current = true;
    setBusy(action);
    setError(null);
    const result = await post(`/api/o/${token}/${action}`, body);
    if (!result.ok) setError(result.message);
    // On failure too: someone else (the seller) may have changed the order. Clearing `busy`
    // inside the transition shows it only together with the refreshed page.
    startTransition(() => {
      setBusy(null);
      router.refresh();
    });
    inFlight.current = false;
    return result.ok;
  }
  return { busy, error, run };
}

export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={`Copy ${label}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          // Clipboard blocked: the number stays on screen to type.
        }
      }}
      className="flex h-11 min-w-20 shrink-0 items-center justify-center rounded-pill border border-primary px-4 text-body-strong text-primary"
    >
      <span aria-live="polite">{copied ? 'Copied' : 'Copy'}</span>
    </button>
  );
}

export interface PayAccount {
  type: 'till' | 'pochi' | 'paybill';
  number: string;
  name: string;
  accountRef: string | null;
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-pill bg-primary-tint text-body-strong text-primary">
        {n}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </li>
  );
}

function CopyRow({ label, value, shown }: { label: string; value: string; shown?: string }) {
  return (
    <div className="mt-2 flex items-center gap-3 rounded-lg bg-background px-4 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-small text-text-secondary">{label}</p>
        <p className="text-title tracking-wide text-navy">{shown ?? value}</p>
      </div>
      <CopyButton value={value} label={label.toLowerCase()} />
    </div>
  );
}

/** The pay page's instructions, card and buttons (web 04b, redesigned). */
export function PayPanel({
  token,
  total,
  shopName,
  account,
  canSwitch,
  canCancel,
}: {
  token: string;
  total: number;
  shopName: string;
  account: PayAccount;
  canSwitch: boolean;
  canCancel: boolean;
}) {
  const { busy, error, run } = useAction(token);
  const [message, setMessage] = useState('');
  const [confirmCancel, setConfirmCancel] = useState(false);
  const code = message.trim() ? extractMpesaCode(message) : null;
  const menu =
    account.type === 'till'
      ? 'Buy Goods and Services'
      : account.type === 'pochi'
        ? 'Pochi la Biashara'
        : 'Pay Bill';

  return (
    <>
      <ol className="mt-5 space-y-5 rounded-xl border border-border p-4">
        <Step n={1}>
          <p className="text-body text-navy">
            Open <strong>M-Pesa</strong> → <strong>Lipa na M-Pesa</strong> → <strong>{menu}</strong>
          </p>
        </Step>
        <Step n={2}>
          {account.type === 'till' ? (
            <CopyRow label="Till number" value={account.number} />
          ) : account.type === 'pochi' ? (
            <CopyRow
              label="Phone number"
              value={formatKePhone(account.number).replaceAll(' ', '')}
              shown={formatKePhone(account.number)}
            />
          ) : (
            <>
              <CopyRow label="Business number" value={account.number} />
              {account.accountRef ? (
                <CopyRow label="Account number" value={account.accountRef} />
              ) : null}
            </>
          )}
          <CopyRow label="Amount" value={String(total)} shown={formatKsh(total)} />
        </Step>
        <Step n={3}>
          <p className="text-body text-navy">
            Check you see <strong>{account.name}</strong>, then enter your M-Pesa PIN.
          </p>
        </Step>
        <Step n={4}>
          <label htmlFor="mpesa-message" className="text-body text-navy">
            Paste your M-Pesa message or the code
          </label>
          <textarea
            id="mpesa-message"
            rows={3}
            maxLength={1000}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="e.g. SJK4X7PQ2M Confirmed. Ksh4,300.00 sent to…"
            aria-describedby="mpesa-code"
            className="mt-2 w-full rounded-lg border border-border bg-surface px-4 py-3 text-body text-text outline-none placeholder:text-text-muted focus:border-navy focus:ring-2 focus:ring-navy/20"
          />
          <p id="mpesa-code" aria-live="polite" className="mt-1 min-h-6 text-small">
            {code ? (
              <span className="font-semibold text-green">
                ✓ Code <span className="tracking-wide">{code}</span>
              </span>
            ) : message.trim() ? (
              <span className="text-text-secondary">
                We can’t see a code yet. It looks like SJK4X7PQ2M.
              </span>
            ) : null}
          </p>
        </Step>
      </ol>

      {error ? (
        <p
          role="alert"
          className="mt-4 rounded-lg bg-warning-tint p-4 text-body text-warning-text-strong"
        >
          {error}
        </p>
      ) : null}

      <button
        type="button"
        disabled={!code || !!busy}
        onClick={() => run('code', { message })}
        className="mt-5 flex h-14 w-full items-center justify-center rounded-pill bg-primary text-button text-text-on-primary disabled:bg-surface-muted disabled:text-text-secondary"
      >
        {busy === 'code' ? 'Sending…' : 'I’ve paid'}
      </button>
      {canSwitch ? (
        <button
          type="button"
          disabled={!!busy}
          onClick={() => run('switch-to-pod')}
          className="mt-3 flex h-14 w-full items-center justify-center rounded-pill bg-primary-tint text-button text-primary disabled:bg-surface-muted disabled:text-text-secondary"
        >
          {busy === 'switch-to-pod' ? 'Switching…' : 'Pay on delivery instead'}
        </button>
      ) : null}
      {canCancel ? (
        confirmCancel ? (
          <div className="mt-3 rounded-xl border border-border p-4 text-center">
            <p className="text-body text-navy">Cancel this order?</p>
            <div className="mt-3 flex gap-3">
              <button
                type="button"
                disabled={!!busy}
                onClick={() => setConfirmCancel(false)}
                className="h-12 flex-1 rounded-pill border border-border text-body-strong text-navy disabled:text-text-secondary"
              >
                Keep it
              </button>
              <button
                type="button"
                disabled={!!busy}
                onClick={() => run('cancel')}
                className="h-12 flex-1 rounded-pill bg-danger text-body-strong text-text-on-primary disabled:opacity-60"
              >
                {busy === 'cancel' ? 'Cancelling…' : 'Yes, cancel'}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmCancel(true)}
            className="mt-3 flex h-14 w-full items-center justify-center rounded-pill border border-border text-button text-text-secondary"
          >
            Cancel order
          </button>
        )
      ) : null}
      <p className="mt-4 text-center text-small text-text-secondary">
        You pay {shopName} directly. oda never holds your money.
      </p>
    </>
  );
}

/** "Changed your mind?" (web 6, without the countdown: design-changes). */
export function CancelCard({
  token,
  shopName,
  claimed,
}: {
  token: string;
  shopName: string;
  claimed: boolean;
}) {
  const { busy, error, run } = useAction(token);
  const [confirm, setConfirm] = useState(false);
  return (
    <section
      aria-labelledby="cancel-title"
      className="mt-5 rounded-xl border border-primary-soft bg-primary-tint p-4"
    >
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 id="cancel-title" className="text-subtitle text-navy">
            Changed your mind?
          </h2>
          <p className="text-body text-text-secondary">
            You can cancel until {shopName} confirms.
            {claimed ? ` ${shopName} will send your money back on M-Pesa.` : ''}
          </p>
        </div>
        {!confirm ? (
          <button
            type="button"
            onClick={() => setConfirm(true)}
            className="h-12 shrink-0 rounded-pill border-2 border-primary bg-surface px-5 text-body-strong text-primary"
          >
            Cancel
          </button>
        ) : null}
      </div>
      {confirm ? (
        <div className="mt-3 flex gap-3">
          <button
            type="button"
            disabled={!!busy}
            onClick={() => setConfirm(false)}
            className="h-12 flex-1 rounded-pill border border-border bg-surface text-body-strong text-navy disabled:text-text-secondary"
          >
            Keep my order
          </button>
          <button
            type="button"
            disabled={!!busy}
            onClick={() => run('cancel')}
            className="h-12 flex-1 rounded-pill bg-danger text-body-strong text-text-on-primary disabled:opacity-60"
          >
            {busy ? 'Cancelling…' : 'Yes, cancel it'}
          </button>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="mt-3 text-body text-warning-text-strong">
          {error}
        </p>
      ) : null}
    </section>
  );
}

/** "Report a problem to oda" (→ reports). Opens in place; works for a closed shop too. */
export function ReportProblem({ token }: { token: string }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [phone, setPhone] = useState('');
  const [website, setWebsite] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  if (sent) {
    return (
      <p role="status" className="px-4 py-4 text-body text-green">
        Thanks. oda will look into it and contact you if we need more details.
      </p>
    );
  }
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left"
      >
        <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary-tint text-primary">
          <ShieldWarningIcon size={22} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-body-strong text-navy">Report a problem to oda</span>
          <span className="block text-small text-text-secondary">
            Payment issues or a seller not responding
          </span>
        </span>
        <span aria-hidden="true" className="text-title text-navy">
          ›
        </span>
      </button>
    );
  }
  return (
    <form
      className="px-4 py-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        if (message.trim().length < 5) return setError('Tell us what went wrong.');
        setBusy(true);
        setError(null);
        const result = await post(`/api/o/${token}/report`, {
          message,
          contactPhone: phone,
          ...(website ? { website } : {}),
        });
        setBusy(false);
        if (result.ok) setSent(true);
        else setError(result.message);
      }}
    >
      <label htmlFor="report-message" className="text-body-strong text-navy">
        What went wrong?
      </label>
      <textarea
        id="report-message"
        rows={4}
        maxLength={1000}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        aria-invalid={error && message.trim().length < 5 ? true : undefined}
        aria-describedby={error ? 'report-error' : undefined}
        className="mt-2 w-full rounded-lg border border-border bg-surface px-4 py-3 text-body text-text outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
      />
      <label htmlFor="report-phone" className="mt-3 block text-small text-text-secondary">
        Your phone, if we should call you (optional)
      </label>
      <input
        id="report-phone"
        type="tel"
        inputMode="tel"
        maxLength={20}
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        className="mt-1 h-12 w-full rounded-lg border border-border bg-surface px-4 text-body text-text outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
      />
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>
          Website
          <input
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </label>
      </div>
      {error ? (
        <p id="report-error" role="alert" className="mt-2 text-body text-danger">
          {error}
        </p>
      ) : null}
      <div className="mt-3 flex gap-3">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="h-12 flex-1 rounded-pill border border-border text-body-strong text-navy"
        >
          Close
        </button>
        <button
          type="submit"
          disabled={busy}
          className="h-12 flex-1 rounded-pill bg-navy text-body-strong text-text-on-navy"
        >
          {busy ? 'Sending…' : 'Send to oda'}
        </button>
      </div>
    </form>
  );
}
