import { describe, expect, it } from 'vitest';
import {
  accountShort,
  buyersSeeLine,
  displayName,
  displayNumber,
  initials,
  memberSince,
  passwordFormProblem,
  profileChanges,
  type ProfileForm,
} from './form';

const till = {
  type: 'till' as const,
  number: '123456',
  accountName: 'AMANI STYLES',
  accountRefMode: null,
  accountRef: null,
};

describe('payment account wording (20b-payments)', () => {
  it('groups numbers the way M-Pesa stickers show them', () => {
    expect(displayNumber(till)).toBe('123 456');
    expect(displayNumber({ type: 'paybill', number: '2472471' })).toBe('2 472 471');
    expect(displayNumber({ type: 'pochi', number: '+254712345678' })).toBe('0712 345 678');
    expect(accountShort(till)).toBe('Till 123 456');
  });

  it('says what buyers see at checkout', () => {
    expect(buyersSeeLine(till)).toBe('Pay KSh 2,500 to Till 123 456, AMANI STYLES');
    expect(
      buyersSeeLine({
        ...till,
        type: 'paybill',
        number: '247247',
        accountRefMode: 'fixed',
        accountRef: '0123',
      }),
    ).toBe('Pay KSh 2,500 to Paybill 247 247, account 0123, AMANI STYLES');
    expect(
      buyersSeeLine({ ...till, type: 'paybill', number: '247247', accountRefMode: 'order_number' }),
    ).toBe('Pay KSh 2,500 to Paybill 247 247, account: their order number, AMANI STYLES');
  });
});

describe('shop profile changes', () => {
  const saved: ProfileForm = {
    name: 'Amani Styles',
    slug: 'amani-styles',
    logoPath: null,
    about: 'Ankara pieces',
    locationLabel: null,
    whatsappPhone: '+254712345678',
    callsEnabled: false,
    tiktokHandle: 'amani.styles',
    instagramHandle: null,
  };

  it('sends only what changed; an emptied field is removed (null)', () => {
    expect(profileChanges(saved, { ...saved, name: ' Amani Styles ' })).toEqual({});
    expect(
      profileChanges(saved, {
        ...saved,
        about: '',
        locationLabel: 'Kilimani, Nairobi',
        callsEnabled: true,
        logoPath: 'logos/x/y.jpg',
      }),
    ).toEqual({
      about: null,
      locationLabel: 'Kilimani, Nairobi',
      callsEnabled: true,
      logoPath: 'logos/x/y.jpg',
    });
  });
});

describe('change password form', () => {
  it('checks in order: current, rules, different, confirm', () => {
    expect(passwordFormProblem({ current: '', next: '', confirm: '' })?.field).toBe('current');
    expect(passwordFormProblem({ current: 'kitenge2026', next: 'short', confirm: '' })?.field).toBe(
      'next',
    );
    expect(
      passwordFormProblem({ current: 'kitenge2026', next: 'kitenge2026', confirm: 'kitenge2026' })
        ?.message,
    ).toMatch(/different/);
    expect(
      passwordFormProblem({ current: 'kitenge2026', next: 'shanga2027', confirm: 'shanga2028' })
        ?.field,
    ).toBe('confirm');
    expect(
      passwordFormProblem({ current: 'kitenge2026', next: 'shanga2027', confirm: 'shanga2027' }),
    ).toBeNull();
  });
});

describe('your details header', () => {
  it('names, initials and member since (Nairobi time)', () => {
    expect(displayName('Amani', 'Wairimu', 'a@x.test')).toBe('Amani Wairimu');
    expect(displayName(null, null, 'amani.styles@gmail.com')).toBe('amani.styles');
    expect(initials('Amani Wairimu')).toBe('AW');
    expect(initials('amani')).toBe('A');
    // 22:00 UTC on 31 Aug is already 1 Sep in Nairobi.
    expect(memberSince('2026-08-31T22:00:00Z')).toBe('since Sep 2026');
  });
});
