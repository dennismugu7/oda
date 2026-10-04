// Words and icons for onboarding (designs 09, 10, 13), plus how API errors read to the seller.
import type MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { colors } from '@oda/ui-tokens';
import type { BusinessType, Channel, PaymentAccountType } from '@oda/shared';
import type { ComponentProps } from 'react';
import type { ApiError } from '@/api';
import { OFFLINE_MESSAGE, UNREACHABLE_MESSAGE } from '@/auth/errors';

export type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

export const BUSINESS_TYPE_OPTIONS: { value: BusinessType; label: string; icon: IconName }[] = [
  { value: 'fashion', label: 'Clothes & fashion', icon: 'tshirt-crew-outline' },
  { value: 'shoes_bags', label: 'Shoes & bags', icon: 'shopping-outline' },
  { value: 'beauty_hair', label: 'Beauty & hair', icon: 'lotion-outline' },
  { value: 'food_drinks', label: 'Food & drinks', icon: 'bowl-mix-outline' },
  { value: 'phones_electronics', label: 'Phones & electronics', icon: 'cellphone' },
  { value: 'home_decor', label: 'Home & decor', icon: 'home-outline' },
  { value: 'baby_kids', label: 'Baby & kids', icon: 'emoticon-happy-outline' },
  { value: 'other', label: 'Something else', icon: 'dots-horizontal' },
];

export function businessTypeLabel(type: BusinessType | null | undefined): string {
  return BUSINESS_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? '';
}

export const CHANNEL_OPTIONS: {
  value: Channel;
  title: string;
  subtitle?: string;
  icon: IconName;
  /** Shown instead of `icon`: an official brand mark, or WhatsApp's Status ring (#55). */
  mark?: 'whatsapp' | 'instagram' | 'facebook' | 'status';
  tint: string;
  iconColor: string;
}[] = [
  {
    value: 'whatsapp',
    title: 'WhatsApp chats',
    subtitle: 'Groups and direct messages',
    icon: 'chat-outline',
    mark: 'whatsapp',
    tint: colors.greenTint,
    iconColor: colors.green,
  },
  {
    value: 'whatsapp_status',
    title: 'WhatsApp Status',
    icon: 'circle-outline',
    mark: 'status',
    tint: colors.greenTint,
    iconColor: colors.green,
  },
  {
    value: 'tiktok',
    title: 'TikTok',
    icon: 'music-note',
    tint: colors.surfaceMuted,
    iconColor: colors.navy,
  },
  {
    value: 'instagram',
    title: 'Instagram',
    icon: 'instagram',
    mark: 'instagram',
    tint: colors.peach,
    iconColor: colors.primary,
  },
  {
    value: 'facebook',
    title: 'Facebook groups',
    icon: 'account-group-outline',
    mark: 'facebook',
    tint: colors.infoTint,
    iconColor: colors.info,
  },
  {
    value: 'market_stall',
    title: 'A shop or market stall',
    icon: 'storefront-outline',
    tint: colors.beige,
    iconColor: colors.warningText,
  },
];

export const PAYMENT_OPTIONS: {
  value: PaymentAccountType;
  label: string;
  icon: IconName;
  hint: string;
  numberLabel: string;
  placeholder: string;
}[] = [
  {
    value: 'till',
    label: 'Buy Goods\nTill',
    icon: 'qrcode',
    hint: 'The number on your Lipa na M-Pesa sticker.',
    numberLabel: 'Till number',
    placeholder: 'e.g. 123456',
  },
  {
    value: 'pochi',
    label: 'Pochi la\nBiashara',
    icon: 'cellphone',
    hint: 'Buyers pay to your Pochi phone number.',
    numberLabel: 'Pochi phone number',
    placeholder: '0712 345 678',
  },
  {
    value: 'paybill',
    label: 'Paybill',
    icon: 'file-document-outline',
    hint: 'A business or bank Paybill number.',
    numberLabel: 'Paybill number',
    placeholder: 'e.g. 247247',
  },
];

const FALLBACK = 'Something went wrong. Try again.';

/** The sentence to show for a failed call. */
export function errorMessage(error: ApiError | null | undefined): string {
  if (!error) return FALLBACK;
  if (error.code === 'OFFLINE') return OFFLINE_MESSAGE;
  if (error.code === 'TIMEOUT' || error.code === 'UNREACHABLE') return UNREACHABLE_MESSAGE;
  if (error.status === 401) return 'You were signed out. Sign in again to carry on.';
  return error.message || FALLBACK;
}
