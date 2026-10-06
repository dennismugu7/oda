import { patchAccount, deleteAccount } from '@/server/settingsRoutes';

export const dynamic = 'force-dynamic';

// 20b-payments: edit an account, or remove a saved (not active) one.
export const PATCH = patchAccount;
export const DELETE = deleteAccount;
