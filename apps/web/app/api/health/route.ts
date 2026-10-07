import { checkHealth, ConfigError } from '@/server/health';
import { describeError } from '@/server/safeLog';

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
    if (error instanceof ConfigError) {
      // Names the variables (zod's messages), never their values.
      console.error('[health] configuration is invalid', error.message);
      return Response.json(
        { ok: false, config: 'invalid', commit },
        { status: 503, headers: { 'cache-control': 'no-store' } },
      );
    }
    console.error(`[health] database check failed: ${describeError(error)}`);
    return Response.json(
      { ok: false, db: 'down', commit },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    );
  }
}
