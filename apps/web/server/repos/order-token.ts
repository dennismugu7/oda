import 'server-only';
import { asc, eq } from 'drizzle-orm';
import { schema, type Db } from '@oda/db';
import type { OrderTokenCtx } from '../authz';

// What the buyer sees on their order page (/o/{token}). Their own details are fine to show;
// internal ids, the idempotency key and the seller's private fields are not.

const t = schema;

export function orderTokenRepo(db: Db, ctx: OrderTokenCtx) {
  return {
    async view() {
      const o = ctx.order;
      const [shop, items] = await Promise.all([
        db.query.shops.findFirst({
          columns: {
            name: true,
            slug: true,
            logoPath: true,
            whatsappPhone: true,
            callsEnabled: true,
            pickupLocation: true,
            pickupHours: true,
          },
          where: eq(t.shops.id, o.shopId),
        }),
        db
          .select({
            productId: t.orderItems.productId,
            name: t.orderItems.nameSnapshot,
            size: t.orderItems.size,
            colour: t.orderItems.colour,
            unitPrice: t.orderItems.unitPrice,
            qty: t.orderItems.qty,
            coverPath: t.orderItems.coverPathSnapshot,
          })
          .from(t.orderItems)
          .where(eq(t.orderItems.orderId, o.id))
          .orderBy(asc(t.orderItems.createdAt)),
      ]);
      return {
        number: o.number,
        token: o.publicToken,
        status: o.status,
        paymentStatus: o.paymentStatus,
        paymentMethod: o.paymentMethod,
        buyerName: o.buyerName,
        buyerPhone: o.buyerPhone,
        buyerWhatsapp: o.buyerWhatsapp,
        buyerEmail: o.buyerEmail,
        fulfilment: o.fulfilment,
        deliveryAreaName: o.deliveryAreaName,
        addressText: o.addressText,
        sentMethod: o.sentMethod,
        riderPhone: o.riderPhone,
        subtotal: o.subtotal,
        deliveryFee: o.deliveryFee,
        total: o.total,
        paymentAccount: o.paymentAccountSnapshot,
        mpesaCode: o.mpesaCode,
        cancelReason: o.cancelReason,
        cancelledBy: o.cancelledBy,
        placedAt: o.placedAt,
        claimedAt: o.claimedAt,
        confirmedAt: o.confirmedAt,
        paidAt: o.paidAt,
        sentAt: o.sentAt,
        deliveredAt: o.deliveredAt,
        cancelledAt: o.cancelledAt,
        refundedAt: o.refundedAt,
        awaitingPaymentSince: o.awaitingPaymentSince,
        shop: shop ?? null,
        items,
      };
    },
  };
}
