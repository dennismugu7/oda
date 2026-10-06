// The seller app's calls to /api/onboarding and /api/uploads (decision #51, #52). Each step
// answers with the full onboarding state, which the screens render from.
import type {
  BusinessType,
  Channel,
  FinishYourShop,
  OnboardingPayment,
  PaymentAccountType,
} from '@oda/shared';
import { apiJson } from '@/api';

export interface OnboardingPhoto {
  objectKey: string;
  thumbKey: string;
  width: number | null;
  height: number | null;
  url?: string | null;
  thumbUrl?: string | null;
}

export interface OnboardingState {
  /** The step to show (1–6), or null when done. */
  step: number | null;
  done: boolean;
  draft: { businessType: BusinessType | null; channels: Channel[] | null };
  shop: {
    id: string;
    name: string;
    slug: string;
    url: string;
    whatsappPhone: string;
    logoPath: string | null;
    logoUrl: string | null;
    businessType: BusinessType;
    channels: Channel[];
  } | null;
  product: {
    id: string;
    name: string;
    price: number;
    sizes: string[];
    photos: OnboardingPhoto[];
  } | null;
  payment: {
    account: {
      type: PaymentAccountType;
      number: string;
      accountName: string;
      accountRefMode: 'fixed' | 'order_number' | null;
      accountRef: string | null;
    } | null;
    acceptsPayBefore: boolean;
    acceptsPayOnDelivery: boolean;
  } | null;
  checklist: FinishYourShop | null;
  sizePresets: string[];
}

export interface SlugCheck {
  slug: string;
  available: boolean;
  message: string | null;
  suggestions: string[];
}

export const onboardingApi = {
  get: () => apiJson<OnboardingState>('/api/onboarding'),
  answer: (body: { step: 1 | 2; businessType?: BusinessType; channels?: Channel[]; skip?: true }) =>
    apiJson<OnboardingState>('/api/onboarding/answers', { body }),
  checkSlug: (q: { slug?: string; name?: string }) =>
    apiJson<SlugCheck>(
      `/api/onboarding/slug?${new URLSearchParams(q.slug ? { slug: q.slug } : { name: q.name ?? '' })}`,
    ),
  shop: (body: { name: string; slug: string; whatsappPhone: string }) =>
    apiJson<OnboardingState>('/api/onboarding/shop', { body }),
  logo: (logoPath: string | null) =>
    apiJson<OnboardingState>('/api/onboarding/logo', { body: { logoPath } }),
  product: (body: { name: string; price: number; sizes: string[]; photos: OnboardingPhoto[] }) =>
    apiJson<OnboardingState>('/api/onboarding/product', {
      body: {
        ...body,
        photos: body.photos.map(({ objectKey, thumbKey, width, height }) => ({
          objectKey,
          thumbKey,
          width,
          height,
        })),
      },
    }),
  payment: (body: OnboardingPayment) =>
    apiJson<OnboardingState>('/api/onboarding/payment', { body }),
  tick: (item: 'shared_link' | 'tested_whatsapp') =>
    apiJson<OnboardingState>('/api/onboarding/checklist', { body: { item } }),
  complete: () => apiJson<OnboardingState>('/api/onboarding/complete', { body: {} }),
};

export interface SignedUpload {
  key: string;
  url: string;
  method: 'PUT';
  headers: Record<string, string>;
  /** null for feedback screenshots (private store, decision #74 b). */
  publicUrl: string | null;
}

export const uploadsApi = {
  request: (body: {
    kind: 'product' | 'logo' | 'feedback';
    contentType: 'image/jpeg';
    size: number;
  }) => apiJson<SignedUpload>('/api/uploads', { body }),
};
