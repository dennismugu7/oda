import { getShopProfile, patchShopProfile } from '@/server/settingsRoutes';

export const dynamic = 'force-dynamic';

// 20b-shop-profile: what buyers see at the top of the shop, the link change included.
export const GET = getShopProfile;
export const PATCH = patchShopProfile;
