import * as Sentry from '@sentry/nextjs';
import { requireOps } from '@/server/authz';
import { toResponse } from '@/server/errors';

export const dynamic = 'force-dynamic';

// Sends one test error to Sentry (sentry-test workflow, Bearer OPS_SECRET; 404 otherwise;
// decision #87). Its message carries a made-up email and phone on purpose: in Sentry they must
// show as [email] and [phone], proving the scrubber runs.
export async function POST(request: Request) {
  try {
    requireOps(request);
    if (!Sentry.getClient()) {
      return Response.json(
        { sent: false, reason: 'Sentry is not set up (NEXT_PUBLIC_SENTRY_DSN)' },
        { headers: { 'cache-control': 'no-store' } },
      );
    }
    const eventId = Sentry.captureException(
      new Error('oda web test error: contact test.buyer@example.test on 0712 345 678'),
    );
    const sent = await Sentry.flush(5000);
    return Response.json({ sent, eventId }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return toResponse(error);
  }
}
