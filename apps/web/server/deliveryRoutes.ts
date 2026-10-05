import 'server-only';
import {
  deliveryAreaInput,
  deliveryAreaOrderInput,
  deliveryAreaUpdate,
  deliverySettingsUpdate,
} from '@oda/shared';
import { requireSeller } from './authz';
import { getDb } from './db';
import { parseInput } from './errors';
import { deliveryRepo } from './repos/delivery';
import { body, handle } from './routeHandler';

// HTTP handlers for 20b-delivery (M6 CP1): /api/delivery and /api/delivery/areas. Every
// handler needs a seller with a shop and only touches that shop's rows; every write answers
// with the whole delivery view, so the screen redraws from one response. The session is
// checked before the body, so a signed-out request is 401 whatever it sends.

async function repo(request: Request) {
  const db = getDb();
  return deliveryRepo(db, await requireSeller(request, db));
}

/** GET /api/delivery: areas (in order), pickup, free delivery, and whether orders can come in. */
export const getDelivery = handle(async (request) => (await repo(request)).view());

/** PUT /api/delivery: pickup on/off, location, hours; free delivery amount (null = off). */
export const putDelivery = handle(async (request) => {
  const delivery = await repo(request);
  return delivery.updateSettings(parseInput(deliverySettingsUpdate, await body(request)));
});

/** POST /api/delivery/areas: name, fee, method, ETA, free-delivery eligible (goes last). */
export const createArea = handle(async (request) => {
  const delivery = await repo(request);
  return delivery.createArea(
    parseInput(deliveryAreaInput.omit({ position: true }), await body(request)),
  );
}, 201);

/** PATCH /api/delivery/areas/:id: any area fields (order: PUT /api/delivery/areas/order). */
export const updateArea = handle(async (request, id) => {
  const delivery = await repo(request);
  return delivery.updateArea(
    id!,
    parseInput(deliveryAreaUpdate.omit({ position: true }), await body(request)),
  );
});

/** DELETE /api/delivery/areas/:id: soft delete (past orders keep the name). */
export const deleteArea = handle(async (request, id) => (await repo(request)).deleteArea(id!));

/** PUT /api/delivery/areas/order: `ids` = every area of the shop, in the new order. */
export const reorderAreas = handle(async (request) => {
  const delivery = await repo(request);
  const { ids } = parseInput(deliveryAreaOrderInput, await body(request));
  return delivery.reorderAreas(ids);
});
