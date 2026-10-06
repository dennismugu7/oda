// The seller app's calls for the M8a settings screens (/api/me/details, /api/shop/profile,
// /api/payments, /api/shop/pause, /api/feedback) and change password (Better Auth).
import type { AccountRefMode, FeedbackKind, PaymentAccountType } from '@oda/shared';
import { apiJson } from '@/api';
import { authCall, authClient } from '@/auth/client';

export interface Details {
  email: string;
  firstName: string | null;
  lastName: string | null;
  recoveryPhone: string | null;
  memberSince: string;
  shopName: string;
}

export interface ShopProfile {
  name: string;
  slug: string;
  url: string;
  /** e.g. "oda.shop/" before the link name. */
  linkPrefix: string;
  logoPath: string | null;
  logoUrl: string | null;
  about: string | null;
  locationLabel: string | null;
  whatsappPhone: string;
  callsEnabled: boolean;
  tiktokHandle: string | null;
  instagramHandle: string | null;
}

export type ProfileChanges = Partial<
  Pick<
    ShopProfile,
    | 'name'
    | 'slug'
    | 'logoPath'
    | 'about'
    | 'locationLabel'
    | 'whatsappPhone'
    | 'callsEnabled'
    | 'tiktokHandle'
    | 'instagramHandle'
  >
>;

export interface PaymentAccount {
  id: string;
  type: PaymentAccountType;
  number: string;
  accountName: string;
  accountRefMode: AccountRefMode | null;
  accountRef: string | null;
  isActive: boolean;
}

export interface Payments {
  accounts: PaymentAccount[];
  acceptsPayBefore: boolean;
  acceptsPayOnDelivery: boolean;
}

export interface AccountFields {
  type: PaymentAccountType;
  number: string;
  accountName: string;
  accountRefMode: AccountRefMode | null;
  accountRef: string | null;
}

export interface FeedbackForm {
  screenshots: boolean;
  whatsappPhone: string;
}

export const settingsApi = {
  details: () => apiJson<Details>('/api/me/details'),
  saveDetails: (body: {
    firstName?: string | null;
    lastName?: string | null;
    recoveryPhone?: string | null;
  }) => apiJson<Details>('/api/me/details', { method: 'PATCH', body }),
  profile: () => apiJson<ShopProfile>('/api/shop/profile'),
  saveProfile: (body: ProfileChanges) =>
    apiJson<ShopProfile>('/api/shop/profile', { method: 'PATCH', body }),
  payments: () => apiJson<Payments>('/api/payments'),
  paymentSettings: (body: { acceptsPayBefore?: boolean; acceptsPayOnDelivery?: boolean }) =>
    apiJson<Payments>('/api/payments', { method: 'PATCH', body }),
  addAccount: (body: AccountFields) => apiJson<Payments>('/api/payments/accounts', { body }),
  updateAccount: (id: string, body: AccountFields) =>
    apiJson<Payments>(`/api/payments/accounts/${id}`, { method: 'PATCH', body }),
  activateAccount: (id: string) =>
    apiJson<Payments>(`/api/payments/accounts/${id}/activate`, { method: 'POST' }),
  removeAccount: (id: string) =>
    apiJson<Payments>(`/api/payments/accounts/${id}`, { method: 'DELETE' }),
  paused: () => apiJson<{ paused: boolean }>('/api/shop/pause'),
  setPaused: (paused: boolean) =>
    apiJson<{ paused: boolean }>('/api/shop/pause', { method: 'PATCH', body: { paused } }),
  deleteAccount: () =>
    apiJson<Record<string, never>>('/api/me/delete', { body: { confirm: 'DELETE' } }),
  feedbackForm: () => apiJson<FeedbackForm>('/api/feedback'),
  sendFeedback: (body: {
    kind: FeedbackKind;
    message: string;
    screenshotPath: string | null;
    replyOnWhatsapp: boolean;
  }) => apiJson<{ id: string }>('/api/feedback', { body }),
};

/**
 * Through Better Auth's client, so a new session cookie (other phones signed out) is stored
 * on this phone straight away.
 */
export function changePassword(body: {
  currentPassword: string;
  newPassword: string;
  revokeOtherSessions: boolean;
}) {
  return authCall(() => authClient.changePassword(body));
}

/** The last payments view loaded, so the account screen opens without loading again. */
let cachedPayments: Payments | null = null;
export const paymentsCache = {
  get: () => cachedPayments,
  set: (value: Payments | null) => {
    cachedPayments = value;
  },
};
