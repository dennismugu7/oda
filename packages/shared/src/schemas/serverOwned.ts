// Columns only the server sets (docs/data-model.md → Authorization). No write whitelist may
// contain them; shared/src/schemas/write.test.ts checks every schema in WRITE_SCHEMAS.

export const SERVER_OWNED_FIELDS = [
  // keys and ownership
  'id',
  'shopId',
  'ownerId',
  'productId',
  'createdAt',
  'updatedAt',
  'deletedAt',
  // profiles
  'isAdmin',
  'expoPushTokens',
  // shops
  'suspendedAt',
  'orderCounter',
  'onboardingCompletedAt',
  // aggregates kept by triggers
  'ratingAvg',
  'ratingCount',
  'deliveredCount',
  'unitsSold',
  // payment account verification (admin only) and activation (its own action)
  'verificationStatus',
  'verifiedBy',
  'verifiedAt',
  'verificationNote',
  'isActive',
  // orders: only transitionOrder() changes these
  'paymentStatus',
  // support digest marks (decision #74 h) and the team's ticket notes
  'notifiedAt',
  'reportNotifiedAt',
  'adminNote',
] as const;

/**
 * Order status is server-owned too. It isn't in SERVER_OWNED_FIELDS only because products
 * have their own, seller-editable `status` (available / sold out / hidden).
 */
export const ORDER_SERVER_OWNED_FIELDS = [...SERVER_OWNED_FIELDS, 'status'] as const;
