import {
  localObjectExists,
  storageDriver,
  verifyDevUpload,
  writeLocalObject,
} from '@/server/storage';
import { getStorage } from '@/server/storage';
import { MAX_UPLOAD_BYTES } from '@/server/uploads';

export const dynamic = 'force-dynamic';

// Local storage only (decision #52): the target of signed upload URLs in development and the
// way the phone loads those photos. 404 whenever the local driver isn't in use (always on
// Vercel).

const notFound = () => new Response(null, { status: 404 });

function enabled(): boolean {
  try {
    return storageDriver().driver === 'local';
  } catch {
    return false;
  }
}

type Params = { params: Promise<{ key: string[] }> };

const TYPES: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

export async function PUT(request: Request, { params }: Params) {
  if (!enabled()) return notFound();
  const key = (await params).key.join('/');
  const url = new URL(request.url);
  const type = url.searchParams.get('type') ?? '';
  const size = Number(url.searchParams.get('size'));
  const expires = Number(url.searchParams.get('expires'));
  if (!verifyDevUpload(key, type, size, expires, url.searchParams.get('sig') ?? '')) {
    return new Response('Signature does not match', { status: 403 });
  }
  if (request.headers.get('content-type') !== type) {
    return new Response('Content-Type does not match', { status: 400 });
  }
  const body = new Uint8Array(await request.arrayBuffer());
  if (body.length !== size || size > MAX_UPLOAD_BYTES) {
    return new Response('Size does not match', { status: 400 });
  }
  await writeLocalObject(key, body);
  return new Response(null, { status: 200 });
}

export async function GET(_request: Request, { params }: Params) {
  if (!enabled()) return notFound();
  const key = (await params).key.join('/');
  if (!(await localObjectExists(key))) return notFound();
  const bytes = await getStorage().read(key);
  if (!bytes) return notFound();
  const ext = key.split('.').pop() ?? '';
  return new Response(Buffer.from(bytes), {
    headers: {
      'content-type': TYPES[ext] ?? 'application/octet-stream',
      'cache-control': 'no-store',
    },
  });
}
