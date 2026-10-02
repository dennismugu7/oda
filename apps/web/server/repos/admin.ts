import 'server-only';
import { and, asc, desc, eq, ilike, isNull, or } from 'drizzle-orm';
import { schema, type Db } from '@oda/db';
import type { AdminCtx } from '../authz';
import { checkId, one } from './util';

// /admin and /api/admin/* (docs/spec.md §7). Only requireAdmin() returns an AdminCtx.

const t = schema;

export function adminRepo(db: Db, ctx: AdminCtx) {
  return {
    async listShops(search = '', limit = 50) {
      const term = search.trim();
      // Escape LIKE wildcards so a search for "50%" matches literally.
      const pattern = `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      return db
        .select({
          id: t.shops.id,
          name: t.shops.name,
          slug: t.shops.slug,
          isPaused: t.shops.isPaused,
          suspendedAt: t.shops.suspendedAt,
          deletedAt: t.shops.deletedAt,
          createdAt: t.shops.createdAt,
        })
        .from(t.shops)
        .where(term ? or(ilike(t.shops.name, pattern), ilike(t.shops.slug, pattern)) : undefined)
        .orderBy(desc(t.shops.createdAt))
        .limit(Math.min(limit, 200));
    },

    /** Suspended shops' public pages return 404. */
    async setShopSuspended(shopId: string, suspended: boolean) {
      return one(
        await db
          .update(t.shops)
          .set({ suspendedAt: suspended ? new Date() : null })
          .where(eq(t.shops.id, checkId(shopId, 'shop')))
          .returning({ id: t.shops.id, suspendedAt: t.shops.suspendedAt }),
        'shop',
      );
    },

    /** The M-Pesa verification queue, oldest first. */
    async listPendingPaymentAccounts() {
      return db
        .select({
          id: t.paymentAccounts.id,
          shopId: t.paymentAccounts.shopId,
          shopName: t.shops.name,
          type: t.paymentAccounts.type,
          number: t.paymentAccounts.number,
          accountName: t.paymentAccounts.accountName,
          accountRefMode: t.paymentAccounts.accountRefMode,
          accountRef: t.paymentAccounts.accountRef,
          updatedAt: t.paymentAccounts.updatedAt,
        })
        .from(t.paymentAccounts)
        .innerJoin(t.shops, eq(t.shops.id, t.paymentAccounts.shopId))
        .where(and(eq(t.paymentAccounts.verificationStatus, 'pending'), isNull(t.shops.deletedAt)))
        .orderBy(asc(t.paymentAccounts.updatedAt));
    },

    async setPaymentVerification(
      accountId: string,
      decision: { status: 'verified' | 'rejected'; note?: string | null },
    ) {
      return one(
        await db
          .update(t.paymentAccounts)
          .set({
            verificationStatus: decision.status,
            verifiedBy: ctx.userId,
            verifiedAt: new Date(),
            verificationNote: decision.note ?? null,
          })
          .where(eq(t.paymentAccounts.id, checkId(accountId, 'payment account')))
          .returning(),
        'payment account',
      );
    },
  };
}
