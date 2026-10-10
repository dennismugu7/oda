import { describe, expect, it } from 'vitest';
import {
  CHUNK_UNITS,
  createRestoreStore,
  DRAFT_TTL_MS,
  draftStorageKey,
  MAX_CHUNKS,
  ROUTE_TTL_MS,
  splitChunks,
  type KeyValue,
} from './store';

function memoryKv() {
  const map = new Map<string, string>();
  const kv: KeyValue = {
    get: async (k) => map.get(k) ?? null,
    set: async (k, v) => {
      map.set(k, v);
    },
    remove: async (k) => {
      map.delete(k);
    },
  };
  return { map, kv };
}

function setup() {
  const { map, kv } = memoryKv();
  let clock = 1_000_000;
  const store = createRestoreStore(kv, () => clock);
  return { map, store, advance: (ms: number) => (clock += ms) };
}

const utf8 = (s: string) => new TextEncoder().encode(s).length;

describe('splitChunks', () => {
  it('splits into chunks that stay under SecureStore’s ~2,000 bytes, even for emoji and accents', () => {
    const text = 'Kitenge 👗 ñ '.repeat(300);
    const chunks = splitChunks(text);
    expect(chunks.join('')).toBe(text);
    for (const c of chunks) {
      expect(c.length).toBeLessThanOrEqual(CHUNK_UNITS);
      expect(utf8(c)).toBeLessThan(2000);
    }
  });

  it('never cuts an emoji in half', () => {
    const text = `${'a'.repeat(CHUNK_UNITS - 1)}👗b`;
    const chunks = splitChunks(text);
    expect(chunks[0]).toBe('a'.repeat(CHUNK_UNITS - 1));
    expect(chunks[1]).toBe('👗b');
  });

  it('gives nothing for an empty string', () => {
    expect(splitChunks('')).toEqual([]);
  });
});

describe('drafts', () => {
  it('keeps a large draft across chunks and reads it back', async () => {
    const { map, store } = setup();
    const draft = { name: 'Ankara dress', description: 'Pure cotton. '.repeat(400) };
    await store.saveDraft('product.p1', draft);
    expect(await store.loadDraft('product.p1')).toEqual(draft);
    const key = draftStorageKey('product.p1');
    const head = JSON.parse(map.get(key)!);
    expect(head.n).toBeGreaterThan(1);
    for (const [k, v] of map) if (k.startsWith(`${key}.`)) expect(utf8(v)).toBeLessThan(2000);
  });

  it('expires after 12 hours', async () => {
    const { map, store, advance } = setup();
    await store.saveDraft('feedback', { message: 'Hi' });
    advance(DRAFT_TTL_MS);
    expect(await store.hasDraft('feedback')).toBe(true);
    advance(1);
    expect(await store.hasDraft('feedback')).toBe(false);
    expect(await store.loadDraft('feedback')).toBeNull();
    expect([...map.keys()].filter((k) => k.includes('.d.'))).toEqual([]);
  });

  it('keeps drafts apart by key (one product’s draft never lands on another)', async () => {
    const { store } = setup();
    await store.saveDraft('product.p1', { name: 'One' });
    expect(await store.loadDraft('product.p2')).toBeNull();
    expect(await store.loadDraft('product.p1')).toEqual({ name: 'One' });
  });

  it('a shorter save removes the old chunks', async () => {
    const { map, store } = setup();
    await store.saveDraft('feedback', { message: 'x'.repeat(5000) });
    await store.saveDraft('feedback', { message: 'short' });
    const key = draftStorageKey('feedback');
    expect([...map.keys()].filter((k) => k.startsWith(`${key}.`))).toEqual([`${key}.0`]);
    expect(await store.loadDraft('feedback')).toEqual({ message: 'short' });
  });

  it('drops a draft with a missing chunk instead of restoring half of it', async () => {
    const { map, store } = setup();
    await store.saveDraft('feedback', { message: 'y'.repeat(3000) });
    map.delete(`${draftStorageKey('feedback')}.1`);
    expect(await store.loadDraft('feedback')).toBeNull();
    expect(map.has(draftStorageKey('feedback'))).toBe(false);
  });

  it('doesn’t keep a draft bigger than the limit', async () => {
    const { store } = setup();
    await store.saveDraft('feedback', { message: 'z'.repeat(CHUNK_UNITS * (MAX_CHUNKS + 1)) });
    expect(await store.loadDraft('feedback')).toBeNull();
  });

  it('deleteDraft removes every chunk', async () => {
    const { map, store } = setup();
    await store.saveDraft('order.new', { name: 'Wanjiku', note: 'n'.repeat(2000) });
    await store.deleteDraft('order.new');
    expect(map.size).toBe(0);
  });

  it('makes safe storage keys', () => {
    expect(draftStorageKey('review-reply')).toBe('oda_restore.d.review-reply');
    expect(draftStorageKey('a/b c')).toBe('oda_restore.d.a_b_c');
  });
});

describe('the last screen', () => {
  it('is kept for 1 hour', async () => {
    const { store, advance } = setup();
    await store.saveRoute({ pathname: '/orders/o1', params: {} });
    advance(ROUTE_TTL_MS);
    expect(await store.loadRoute()).toEqual({ pathname: '/orders/o1', params: {} });
    advance(1);
    expect(await store.loadRoute()).toBeNull();
  });
});

describe('clearAll (sign-out)', () => {
  it('removes every draft and the last screen', async () => {
    const { map, store } = setup();
    await store.saveDraft('product.new', { name: 'Shirt' });
    await store.saveDraft('feedback', { message: 'x'.repeat(4000) });
    await store.saveRoute({ pathname: '/products/new', params: {} });
    await store.clearAll();
    expect(map.size).toBe(0);
  });
});
