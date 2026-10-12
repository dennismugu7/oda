import 'server-only';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { schema, type Db } from '@oda/db';
import {
  hasDeliveryOption,
  type DeliveryAreaInput,
  type DeliveryAreaUpdate,
  type DeliverySettingsUpdate,
} from '@oda/shared';
import type { SellerCtx } from '../authz';
import { ValidationError } from '../errors';
import { sellerRepo } from './seller';

// The seller's delivery options (20b-delivery, M6 CP1): areas, pickup and free delivery.
// Built on sellerRepo, so another shop's area is a plain 404. Areas are soft-deleted: past
// orders keep the area's name.

const t = schema;
type AreaRow = typeof t.deliveryAreas.$inferSelect;

const areaView = (a: AreaRow) => ({
  id: a.id,
  name: a.name,
  fee: a.fee,
  method: a.method,
  etaLabel: a.etaLabel,
  freeDeliveryEligible: a.freeDeliveryEligible,
  position: a.position,
});

export type DeliveryAreaView = ReturnType<typeof areaView>;

export function deliveryRepo(db: Db, ctx: SellerCtx) {
  const seller = sellerRepo(db, ctx);

  async function view() {
    const [shop, areas] = await Promise.all([seller.getShop(), seller.listDeliveryAreas()]);
    return {
      areas: areas.map(areaView),
      pickupEnabled: shop.pickupEnabled,
      pickupLocation: shop.pickupLocation,
      pickupHours: shop.pickupHours,
      freeDeliveryThreshold: shop.freeDeliveryThreshold,
      hasDeliveryOption: hasDeliveryOption({
        areaCount: areas.length,
        pickupEnabled: shop.pickupEnabled,
      }),
      /** "I'll arrange delivery with buyers" was tapped (decision #110 e). */
      arrangeDelivery: !!(shop.checklist as Record<string, string> | null)?.arrange_delivery,
    };
  }

  return {
    view,

    /** Pickup needs a place buyers can find; free delivery is an amount or off (null). */
    async updateSettings(input: DeliverySettingsUpdate) {
      const shop = await seller.getShop();
      const pickupEnabled = input.pickupEnabled ?? shop.pickupEnabled;
      const location =
        input.pickupLocation !== undefined ? input.pickupLocation : shop.pickupLocation;
      if (pickupEnabled && !location) {
        throw new ValidationError('Enter where buyers pick up their orders.', {
          pickupLocation: 'Enter where buyers pick up their orders.',
        });
      }
      await seller.updateShop(input);
      return view();
    },

    /** New areas go to the end of the list. */
    async createArea(input: Omit<DeliveryAreaInput, 'position'>) {
      const [last] = await db
        .select({ max: sql<number | null>`max(${t.deliveryAreas.position})` })
        .from(t.deliveryAreas)
        .where(and(eq(t.deliveryAreas.shopId, ctx.shopId), isNull(t.deliveryAreas.deletedAt)));
      await seller.createDeliveryArea({ ...input, position: (last?.max ?? -1) + 1 });
      return view();
    },

    async updateArea(id: string, input: Omit<DeliveryAreaUpdate, 'position'>) {
      await seller.updateDeliveryArea(id, input);
      return view();
    },

    async deleteArea(id: string) {
      await seller.deleteDeliveryArea(id);
      return view();
    },

    /** `ids` must be exactly the shop's current areas. */
    async reorderAreas(ids: string[]) {
      const current = await seller.listDeliveryAreas();
      const mine = new Set(current.map((a) => a.id));
      if (ids.length !== mine.size || ids.some((id) => !mine.has(id))) {
        throw new ValidationError('Your delivery areas changed. Refresh and try again.');
      }
      await db.transaction(async (tx) => {
        for (const [position, id] of ids.entries()) {
          await tx
            .update(t.deliveryAreas)
            .set({ position })
            .where(and(eq(t.deliveryAreas.id, id), eq(t.deliveryAreas.shopId, ctx.shopId)));
        }
      });
      return view();
    },
  };
}

/** Area names by id (including deleted ones, which past quotes may still mention). */
export async function getDeliveryNames(db: Db, ctx: SellerCtx): Promise<Record<string, string>> {
  const rows = await db
    .select({ id: t.deliveryAreas.id, name: t.deliveryAreas.name })
    .from(t.deliveryAreas)
    .where(eq(t.deliveryAreas.shopId, ctx.shopId));
  return Object.fromEntries(rows.map((r) => [r.id, r.name]));
}
