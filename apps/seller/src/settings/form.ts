// Pure helpers for the M8a settings screens (unit-tested): account wording on 20b-payments,
// the changes a shop-profile save sends, and the form checks shown before anything is sent.
import { formatKePhone, formatKsh, passwordProblem, type PaymentAccountType } from '@oda/shared';
import type { AccountFields, ShopProfile } from './api';

export const ACCOUNT_TITLES: Record<PaymentAccountType, string> = {
  till: 'Buy Goods Till',
  pochi: 'Pochi la Biashara',
  paybill: 'Paybill',
};

export const NUMBER_LABELS: Record<PaymentAccountType, string> = {
  till: 'Till number',
  pochi: 'Pochi number',
  paybill: 'Paybill number',
};

const SHORT: Record<PaymentAccountType, string> = {
  till: 'Till',
  pochi: 'Pochi',
  paybill: 'Paybill',
};

/** "123 456" for Till and Paybill numbers, "0712 345 678" for Pochi. */
export function displayNumber(account: Pick<AccountFields, 'type' | 'number'>): string {
  if (account.type === 'pochi') return formatKePhone(account.number);
  return account.number.replace(/\B(?=(\d{3})+$)/g, ' ');
}

/** "Till 123 456": the account in a few words (More, the account list). */
export function accountShort(account: Pick<AccountFields, 'type' | 'number'>): string {
  return `${SHORT[account.type]} ${displayNumber(account)}`;
}

/** The example under the active account: what buyers are told at checkout. */
export function buyersSeeLine(account: AccountFields, amount = 2500): string {
  const ref =
    account.type !== 'paybill'
      ? ''
      : account.accountRefMode === 'order_number'
        ? ', account: their order number'
        : account.accountRef
          ? `, account ${account.accountRef}`
          : '';
  return `Pay ${formatKsh(amount)} to ${accountShort(account)}${ref}, ${account.accountName}`;
}

export type ProfileForm = Pick<
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
>;

const trimmed = (value: string | null) => (value ?? '').trim();

/** Only the fields the seller changed (text compared trimmed; emptied = removed, null). */
export function profileChanges(saved: ProfileForm, form: ProfileForm): Partial<ProfileForm> {
  const changes: Record<string, unknown> = {};
  for (const key of Object.keys(form) as (keyof ProfileForm)[]) {
    const before = saved[key];
    const after = form[key];
    if (typeof after === 'boolean' || key === 'logoPath') {
      if (after !== before) changes[key] = after;
      continue;
    }
    const value = trimmed(after as string | null);
    if (value !== trimmed(before as string | null)) changes[key] = value === '' ? null : value;
  }
  return changes as Partial<ProfileForm>;
}

/** A TikTok or Instagram handle as the seller sees it ("@amani.styles"). */
export function handleLabel(handle: string | null): string {
  return handle ? `@${handle}` : 'Not added';
}

export interface PasswordForm {
  current: string;
  next: string;
  confirm: string;
}

/** The first problem with the change-password form, or null when it can be sent. */
export function passwordFormProblem(
  form: PasswordForm,
): { field: 'current' | 'next' | 'confirm'; message: string } | null {
  if (!form.current) return { field: 'current', message: 'Enter your current password.' };
  const rule = passwordProblem(form.next);
  if (rule) return { field: 'next', message: rule };
  if (form.next === form.current) {
    return {
      field: 'next',
      message: 'Choose a new password that is different from your current one.',
    };
  }
  if (form.confirm !== form.next) {
    return { field: 'confirm', message: "The two new passwords don't match." };
  }
  return null;
}

/** 21-share-feedback's chips (Help's "Report a problem" sends `problem`, M8b). */
export const FEEDBACK_CHOICES = [
  { kind: 'idea', label: 'An idea', icon: 'zap' },
  { kind: 'broken', label: "Something's broken", icon: 'tool' },
  { kind: 'confusing', label: "Something's confusing", icon: 'help-circle' },
  { kind: 'love', label: 'I love something', icon: 'heart' },
] as const;

/** "Amani Wairimu", or the email's name part while no name is saved. */
export function displayName(first: string | null, last: string | null, email: string): string {
  const name = [first, last].filter(Boolean).join(' ').trim();
  return name || email.split('@')[0] || email;
}

/** Avatar initials: the shared rule (packages/shared/src/initials.ts). */
export { initials } from '@oda/shared';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "since Sep 2026" (Nairobi time, UTC+3 all year). */
export function memberSince(iso: string): string {
  const at = new Date(new Date(iso).getTime() + 3 * 3_600_000);
  return `since ${MONTHS[at.getUTCMonth()]} ${at.getUTCFullYear()}`;
}
