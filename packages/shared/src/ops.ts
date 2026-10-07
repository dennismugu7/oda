import { z } from 'zod';

// Manual ops workflows (GitHub Actions, Bearer OPS_SECRET): their inputs and the actions
// they write to ops_events (decisions #72 d, #73 c, #81 d).

export const OPS_ACTIONS = [
  'review_removed',
  'shop_suspended',
  'shop_unsuspended',
  'account_deleted',
  'account_purged',
  'purge_run',
  'purge_dry_run',
] as const;

/** The GitHub user who ran the workflow (github.actor). */
export const opsActor = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9-]{1,39}$/, { error: 'Not a GitHub user name.' });

/**
 * POST /api/ops/shops/suspension (the shop-suspend workflow): the shop by its current link
 * name, exactly (no old links, no partial matches), and what to do.
 */
export const shopSuspensionInput = z.strictObject({
  shopSlug: z
    .string()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, { error: 'Not a shop link name.' })
    .max(40),
  action: z.enum(['suspend', 'unsuspend'], { error: 'Choose suspend or unsuspend.' }),
  reason: z.string().trim().min(3, { error: 'Give a reason.' }).max(500),
  actor: opsActor,
});

export type ShopSuspensionInput = z.infer<typeof shopSuspensionInput>;

/** What a suspended seller is told (the email comes from config, decision #77). */
export function suspendedMessage(supportEmail: string): string {
  return `Your shop is suspended. Email ${supportEmail}`;
}
