import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { readOutbox } from '@/server/email/outbox';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Email outbox (local)', robots: { index: false } };

// Local development only (decision #43): the emails the server "sent", so codes and reset
// links can be read on the phone through adb reverse. 404 on every Vercel deployment.
export default async function OutboxPage() {
  const emails = await readOutbox();
  if (!emails) notFound();

  return (
    <main className="mx-auto max-w-md px-4 py-6">
      <h1 className="text-xl font-bold">Email outbox</h1>
      <p className="text-text-secondary mt-1 text-sm">
        Local only. Newest first. Refresh after sending a code or a reset link.
      </p>
      {emails.length === 0 ? (
        <p className="mt-6 text-sm">No emails yet.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {emails.map((email) => {
            const code = /^(\d{6}) is your oda code$/.exec(email.subject)?.[1];
            const link = /https?:\/\/\S+/.exec(email.text)?.[0];
            return (
              <li key={email.id} className="border-border rounded-2xl border bg-white p-4">
                <p className="text-text-secondary text-xs">
                  {new Date(email.sentAt).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' })} ·{' '}
                  {email.to}
                </p>
                <p className="mt-1 font-semibold">{email.subject}</p>
                {code ? (
                  <p className="mt-2 text-3xl font-bold tracking-[0.3em]" data-testid="code">
                    {code}
                  </p>
                ) : null}
                {link ? (
                  <a className="text-primary mt-2 block break-all text-sm underline" href={link}>
                    {link}
                  </a>
                ) : null}
                <details className="mt-2">
                  <summary className="text-text-secondary cursor-pointer text-sm">
                    Show email
                  </summary>
                  <iframe
                    title={email.subject}
                    srcDoc={email.html}
                    sandbox=""
                    className="mt-2 h-[600px] w-full rounded-xl border"
                  />
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
