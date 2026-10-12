import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { schema } from '@oda/db';
import { truncateAll } from '@oda/db/testing';
import { anonCall, newSeller, newUser, type Seller } from '@/test/sellerApi';
import { getDb } from './db';
import {
  createArea,
  deleteArea,
  getDelivery,
  putDelivery,
  reorderAreas,
  updateArea,
} from './deliveryRoutes';
import { getOnboarding, postChecklist } from './onboardingRoutes';
import { publicRepo } from './repos/public';
import type { Handler } from './routeHandler';

// 20b-delivery (M6 CP1): areas, pickup, free delivery, the checklist item and the shop's
// "taking orders" state; each seller only ever reaching their own areas.

const db = () => getDb();

beforeEach(async () => {
  await truncateAll(db());
});
afterAll(async () => {
  await truncateAll(db());
});

const area = (fields: Record<string, unknown> = {}) => ({
  name: 'Kilimani and Westlands',
  fee: 200,
  method: 'rider',
  etaLabel: 'Same day',
  ...fields,
});

async function addArea(s: Seller, fields: Record<string, unknown> = {}) {
  const res = await s.call(createArea, { body: area(fields) });
  expect(res.status).toBe(201);
  return res.json.areas.at(-1) as { id: string; name: string };
}

const put = (s: Seller, body: unknown) => s.call(putDelivery, { method: 'PUT', body });

describe('delivery areas', () => {
  it('starts empty; new areas go to the end; edit, reorder and delete', async () => {
    const s = await newSeller();
    const empty = await s.call(getDelivery);
    expect(empty.status).toBe(200);
    expect(empty.json).toMatchObject({
      areas: [],
      pickupEnabled: false,
      freeDeliveryThreshold: null,
      hasDeliveryOption: false,
      arrangeDelivery: false,
    });
    // "I'll arrange delivery with buyers" (decision #110 e) shows in the view.
    expect((await s.call(postChecklist, { body: { item: 'arrange_delivery' } })).status).toBe(200);
    expect((await s.call(getDelivery)).json.arrangeDelivery).toBe(true);

    const kili = await addArea(s);
    const rest = await addArea(s, { name: 'Rest of Nairobi', fee: 300 });
    const out = await addArea(s, {
      name: 'Outside Nairobi',
      fee: 450,
      method: 'parcel',
      etaLabel: '1–2 days',
    });
    let view = (await s.call(getDelivery)).json;
    expect(view.areas.map((a: { name: string }) => a.name)).toEqual([
      'Kilimani and Westlands',
      'Rest of Nairobi',
      'Outside Nairobi',
    ]);
    expect(view.areas[0]).toMatchObject({ fee: 200, method: 'rider', freeDeliveryEligible: false });
    expect(view.hasDeliveryOption).toBe(true);

    const edited = await s.call(updateArea, {
      method: 'PATCH',
      id: kili.id,
      body: { fee: 250, freeDeliveryEligible: true, etaLabel: '' },
    });
    expect(edited.status).toBe(200);
    expect(edited.json.areas[0]).toMatchObject({
      fee: 250,
      freeDeliveryEligible: true,
      etaLabel: null,
    });

    view = (
      await s.call(reorderAreas, { method: 'PUT', body: { ids: [out.id, kili.id, rest.id] } })
    ).json;
    expect(view.areas.map((a: { id: string }) => a.id)).toEqual([out.id, kili.id, rest.id]);

    const deleted = await s.call(deleteArea, { method: 'DELETE', id: rest.id });
    expect(deleted.status).toBe(200);
    expect(deleted.json.areas).toHaveLength(2);
    // Soft delete: the row stays for past orders.
    const [row] = await db()
      .select()
      .from(schema.deliveryAreas)
      .where(eq(schema.deliveryAreas.id, rest.id));
    expect(row!.deletedAt).not.toBeNull();
    // A deleted area can't be edited any more.
    expect(
      (await s.call(updateArea, { method: 'PATCH', id: rest.id, body: { fee: 1 } })).status,
    ).toBe(404);
  });

  it('refuses bad input with friendly messages, and server-owned fields', async () => {
    const s = await newSeller();
    const bad = (body: unknown) => s.call(createArea, { body });
    expect((await bad(area({ name: '' }))).json.error.message).toBe('Enter area name.');
    expect((await bad(area({ fee: -5 }))).json.error.message).toBe(
      "Delivery fee can't be negative.",
    );
    expect((await bad(area({ fee: 12.5 }))).status).toBe(422);
    expect((await bad(area({ method: 'drone' }))).json.error.message).toBe('Pick rider or parcel.');
    expect((await bad(area({ shopId: randomUUID() }))).json.error.fields).toMatchObject({
      shopId: "This field can't be changed.",
    });
    expect((await bad(area({ position: 3 }))).status).toBe(422);
    expect((await s.call(getDelivery)).json.areas).toHaveLength(0);
  });

  it('reorders only with exactly the shop’s areas', async () => {
    const s = await newSeller();
    const a = await addArea(s);
    const b = await addArea(s, { name: 'CBD' });
    const reorder = (ids: string[]) => s.call(reorderAreas, { method: 'PUT', body: { ids } });
    expect((await reorder([a.id])).status).toBe(422);
    expect((await reorder([a.id, b.id, randomUUID()])).status).toBe(422);
    expect((await reorder([a.id, a.id])).status).toBe(422);
    expect((await reorder([b.id, a.id])).status).toBe(200);
  });
});

describe('pickup and free delivery', () => {
  it('pickup needs a location; free delivery is an amount or off', async () => {
    const s = await newSeller();
    const noPlace = await put(s, { pickupEnabled: true });
    expect(noPlace.status).toBe(422);
    expect(noPlace.json.error.fields).toMatchObject({
      pickupLocation: 'Enter where buyers pick up their orders.',
    });

    const on = await put(s, {
      pickupEnabled: true,
      pickupLocation: 'Kilimani stall',
      pickupHours: 'Mon–Sat 9am–6pm',
    });
    expect(on.status).toBe(200);
    expect(on.json).toMatchObject({
      pickupEnabled: true,
      pickupLocation: 'Kilimani stall',
      pickupHours: 'Mon–Sat 9am–6pm',
      hasDeliveryOption: true,
    });
    // Clearing the location while pickup is on is refused too.
    expect((await put(s, { pickupLocation: '' })).status).toBe(422);

    expect((await put(s, { freeDeliveryThreshold: 5000 })).json.freeDeliveryThreshold).toBe(5000);
    expect((await put(s, { freeDeliveryThreshold: 0 })).status).toBe(422);
    expect((await put(s, { freeDeliveryThreshold: null })).json.freeDeliveryThreshold).toBeNull();

    expect((await put(s, { pickupEnabled: false })).json).toMatchObject({
      pickupEnabled: false,
      hasDeliveryOption: false,
    });

    // Other shop fields can't be changed through this endpoint.
    expect((await put(s, { isPaused: true })).status).toBe(422);
    expect((await put(s, { orderCounter: 5 })).status).toBe(422);
  });

  it('a delivery option ticks "Add delivery options" and lets the shop take orders', async () => {
    const s = await newSeller();
    const item = async () =>
      (await s.call(getOnboarding as unknown as Handler)).json.checklist.items.find(
        (i: { id: string }) => i.id === 'delivery',
      );
    const publicShop = async () => {
      const found = await publicRepo(db()).findShop(s.slug);
      if (found.kind !== 'shop') throw new Error('shop not found');
      return found.shop;
    };
    expect(await item()).toMatchObject({ label: 'Add delivery options', done: false });
    expect((await publicShop()).hasDeliveryOption).toBe(false);

    await put(s, { pickupEnabled: true, pickupLocation: 'Kilimani stall' });
    expect((await item()).done).toBe(true);
    expect((await publicShop()).hasDeliveryOption).toBe(true);

    await put(s, { pickupEnabled: false });
    expect((await item()).done).toBe(false);
    await addArea(s);
    expect((await item()).done).toBe(true);
    expect((await publicShop()).hasDeliveryOption).toBe(true);
  });
});

describe('authorization', () => {
  it("a seller never reaches another shop's delivery areas (404)", async () => {
    const a = await newSeller();
    const b = await newSeller();
    const theirs = await addArea(b, { name: 'Their area' });

    expect(
      (await a.call(updateArea, { method: 'PATCH', id: theirs.id, body: { fee: 1 } })).status,
    ).toBe(404);
    expect((await a.call(deleteArea, { method: 'DELETE', id: theirs.id })).status).toBe(404);
    expect(
      (await a.call(updateArea, { method: 'PATCH', id: 'nope', body: { fee: 1 } })).status,
    ).toBe(404);
    const mine = await addArea(a);
    expect(
      (await a.call(reorderAreas, { method: 'PUT', body: { ids: [mine.id, theirs.id] } })).status,
    ).toBe(422);
    expect((await a.call(getDelivery)).json.areas.map((x: { name: string }) => x.name)).toEqual([
      'Kilimani and Westlands',
    ]);
    // B's area is untouched.
    expect((await b.call(getDelivery)).json.areas[0]).toMatchObject({
      name: 'Their area',
      fee: 200,
    });
  });

  it('is 401 signed out and 404 without a shop', async () => {
    expect(await anonCall(getDelivery)).toBe(401);
    expect(await anonCall(createArea, { method: 'POST' })).toBe(401);
    expect(await anonCall(putDelivery, { method: 'PUT' })).toBe(401);
    const user = await newUser();
    expect((await user.call(getDelivery)).status).toBe(404);
    expect((await user.call(createArea, { body: area() })).status).toBe(404);
  });
});
