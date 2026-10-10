// State restoration storage (decision #100): unsaved form drafts and the last screen, kept
// encrypted on the phone in SecureStore and never sent anywhere. SecureStore values should
// stay under ~2,000 bytes, so a record is split into chunks: `<key>` holds {n, at} and
// `<key>.0` … `<key>.<n-1>` hold the JSON. Pure (the key-value store is passed in), so it is
// unit-tested; src/restore/native.ts wires it to SecureStore.

export interface KeyValue {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string) => Promise<void>;
  remove: (key: string) => Promise<void>;
}

/** Drafts are kept 12 hours (uploaded but unsaved photos are purged on the server after 24 h). */
export const DRAFT_TTL_MS = 12 * 60 * 60 * 1000;
/** The last screen is reopened within 1 hour of leaving the app. */
export const ROUTE_TTL_MS = 60 * 60 * 1000;

/** UTF-16 code units per chunk: at most 3 UTF-8 bytes each, so a chunk stays under 2,000 bytes. */
export const CHUNK_UNITS = 600;
/** A record bigger than this (~24,000 characters) isn't kept. */
export const MAX_CHUNKS = 40;

const PREFIX = 'oda_restore';
const ROUTE_KEY = `${PREFIX}.route`;
const INDEX_KEY = `${PREFIX}.index`;

/** SecureStore keys allow letters, digits, ".", "-" and "_" only. */
export function draftStorageKey(formKey: string): string {
  return `${PREFIX}.d.${formKey.replace(/[^A-Za-z0-9._-]/g, '_')}`;
}

/** Splits text into chunks of at most `size` code units, never between a surrogate pair. */
export function splitChunks(value: string, size = CHUNK_UNITS): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < value.length) {
    let end = Math.min(start + size, value.length);
    const last = value.charCodeAt(end - 1);
    // A high surrogate at the end belongs with the next unit.
    if (end < value.length && last >= 0xd800 && last <= 0xdbff) end -= 1;
    chunks.push(value.slice(start, end));
    start = end;
  }
  return chunks;
}

interface Head {
  n: number;
  at: number;
}

export interface RouteMemory {
  /** e.g. "/orders/abc" (no route groups). */
  pathname: string;
  /** Search params only (not the path's own [id] values). */
  params: Record<string, string>;
}

export function createRestoreStore(kv: KeyValue, now: () => number = Date.now) {
  // One operation at a time, so the index and the chunks never interleave.
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(run: () => Promise<T>): Promise<T> => {
    const next = queue.then(run, run);
    queue = next.catch(() => {});
    return next;
  };

  const fresh = (head: Head, ttl: number) => head.at <= now() && now() - head.at <= ttl;

  async function removeRecord(key: string) {
    const head = parseHead(await kv.get(key).catch(() => null));
    await kv.remove(key).catch(() => {});
    for (let i = 0; i < (head?.n ?? 0); i++) await kv.remove(`${key}.${i}`).catch(() => {});
  }

  async function writeRecord(key: string, data: unknown): Promise<boolean> {
    const chunks = splitChunks(JSON.stringify(data));
    await removeRecord(key);
    if (chunks.length > MAX_CHUNKS) return false;
    for (let i = 0; i < chunks.length; i++) await kv.set(`${key}.${i}`, chunks[i]!);
    // The head last: a record without it is never read.
    await kv.set(key, JSON.stringify({ n: chunks.length, at: now() } satisfies Head));
    return true;
  }

  async function readRecord<T>(key: string, ttl: number): Promise<T | null> {
    const head = parseHead(await kv.get(key).catch(() => null));
    if (!head) return null;
    if (!fresh(head, ttl)) {
      await removeRecord(key);
      return null;
    }
    try {
      let json = '';
      for (let i = 0; i < head.n; i++) {
        const part = await kv.get(`${key}.${i}`);
        if (part == null) throw new Error('missing chunk');
        json += part;
      }
      return JSON.parse(json) as T;
    } catch {
      await removeRecord(key);
      return null;
    }
  }

  async function readIndex(): Promise<string[]> {
    try {
      const list: unknown = JSON.parse((await kv.get(INDEX_KEY)) ?? '[]');
      return Array.isArray(list) ? list.filter((k): k is string => typeof k === 'string') : [];
    } catch {
      return [];
    }
  }

  async function writeIndex(list: string[]) {
    if (list.length) await kv.set(INDEX_KEY, JSON.stringify(list));
    else await kv.remove(INDEX_KEY).catch(() => {});
  }

  return {
    saveDraft: (formKey: string, data: unknown) =>
      serial(async () => {
        const key = draftStorageKey(formKey);
        const index = await readIndex();
        if (!index.includes(key)) await writeIndex([...index, key]);
        await writeRecord(key, data);
      }),
    loadDraft: <T>(formKey: string) =>
      serial(() => readRecord<T>(draftStorageKey(formKey), DRAFT_TTL_MS)),
    hasDraft: (formKey: string) =>
      serial(async () => {
        const head = parseHead(await kv.get(draftStorageKey(formKey)).catch(() => null));
        return !!head && fresh(head, DRAFT_TTL_MS);
      }),
    deleteDraft: (formKey: string) =>
      serial(async () => {
        const key = draftStorageKey(formKey);
        await removeRecord(key);
        const index = await readIndex();
        if (index.includes(key)) await writeIndex(index.filter((k) => k !== key));
      }),
    saveRoute: (route: RouteMemory) => serial(() => writeRecord(ROUTE_KEY, route)),
    loadRoute: () => serial(() => readRecord<RouteMemory>(ROUTE_KEY, ROUTE_TTL_MS)),
    deleteRoute: () => serial(() => removeRecord(ROUTE_KEY)),
    /** Sign-out: every draft and the last screen. */
    clearAll: () =>
      serial(async () => {
        for (const key of await readIndex()) await removeRecord(key);
        await writeIndex([]);
        await removeRecord(ROUTE_KEY);
      }),
  };
}

export type RestoreStore = ReturnType<typeof createRestoreStore>;

function parseHead(raw: string | null): Head | null {
  if (!raw) return null;
  try {
    const head = JSON.parse(raw) as Partial<Head>;
    return typeof head.n === 'number' &&
      Number.isInteger(head.n) &&
      head.n >= 0 &&
      typeof head.at === 'number'
      ? { n: head.n, at: head.at }
      : null;
  } catch {
    return null;
  }
}
