import { checkHealth } from '@/server/health';

export const dynamic = 'force-dynamic';

// Liveness + DB check for staging monitors. Exposes no configuration.
export async function GET() {
  const commit = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'local';
  try {
    await checkHealth();
    return Response.json(
      { ok: true, db: 'up', commit },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    console.error('[health] database check failed', error);
    return Response.json(
      { ok: false, db: 'down', commit },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    );
  }
}
