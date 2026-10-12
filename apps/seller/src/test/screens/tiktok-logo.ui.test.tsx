import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';
import type { ApiError } from '@/api';
import type { OnboardingState } from '@/onboarding/api';
import { setOnboardingState } from '@/onboarding/useOnboarding';
import type { ShopProfile } from '@/settings/api';
import { clearSettingsCaches } from '@/settings/useLoaded';
import type { ShareData } from '@/share/plan';
import ShopLive from '../../../app/onboarding/live';
import WhereYouSell from '../../../app/onboarding/where-you-sell';
import ShareScreen from '../../../app/share';
import ShopProfileScreen from '../../../app/shop-profile';

// Decision #108 (amends #101 c): everywhere TikTok is shown, it is TikTok's official icon from
// its developer logo pack, unmodified, in the same tile or circle as the other brand marks.

const TIKTOK = require('../../../assets/brands/tiktok-icon-black-circle.png');

type Answer<T> = Promise<{ data: T | null; error: ApiError | null }>;
const mockOnboarding = jest.fn<() => Answer<OnboardingState>>();
const mockShare = jest.fn<() => Answer<ShareData>>();
const mockProfile = jest.fn<() => Answer<ShopProfile>>();

jest.mock('@/onboarding/api', () => ({
  onboardingApi: {
    get: () => mockOnboarding(),
    answer: jest.fn(),
    tick: jest.fn(async () => ({ data: null, error: null })),
  },
  uploadsApi: { request: jest.fn() },
}));
jest.mock('@/insights/api', () => ({ growApi: { share: () => mockShare() } }));
jest.mock('@/settings/api', () => ({
  settingsApi: { profile: () => mockProfile(), saveProfile: jest.fn() },
}));

/** A host element of the rendered tree (screen.toJSON()). */
type Node = { type: string; props: Record<string, unknown>; children: (Node | string)[] | null };

function nodes(tree: Node | Node[] | null): Node[] {
  if (!tree) return [];
  const list = Array.isArray(tree) ? tree : [tree];
  return list.flatMap((n) => [
    n,
    ...nodes((n.children ?? []).filter((c: Node | string): c is Node => typeof c !== 'string')),
  ]);
}

/** The image sources inside the element whose accessibility label is `label`. */
function imagesIn(label: string | RegExp): unknown[] {
  const owner = nodes(screen.toJSON() as Node | Node[] | null).find((n) => {
    const own = n.props.accessibilityLabel;
    return typeof own === 'string' && (typeof label === 'string' ? own === label : label.test(own));
  });
  expect(owner).toBeDefined();
  return nodes(owner!)
    .filter((n) => n.type === 'Image')
    .map((n) => n.props.source);
}

const SHOP = {
  id: 's1',
  name: 'Amani Styles',
  slug: 'amani-styles',
  url: 'https://oda.example/amani-styles',
  whatsappPhone: '+254712345678',
  logoPath: null,
  logoUrl: null,
  businessType: 'fashion' as const,
  channels: ['tiktok' as const, 'whatsapp' as const],
};

function onboarding(over: Partial<OnboardingState> = {}): OnboardingState {
  return {
    step: 2,
    done: false,
    draft: { businessType: 'fashion', channels: null },
    shop: null,
    product: null,
    payment: null,
    checklist: null,
    sizePresets: [],
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  setOnboardingState(null);
  clearSettingsCaches();
});

describe('TikTok shows its official icon', () => {
  it('step 2, "Where do you sell today?": the TikTok choice', async () => {
    mockOnboarding.mockResolvedValue({ data: onboarding(), error: null });
    await render(<WhereYouSell />);
    await screen.findByRole('checkbox', { name: 'TikTok' });
    expect(imagesIn('TikTok')).toEqual([TIKTOK]);
  });

  it('step 6: the TikTok share button', async () => {
    mockOnboarding.mockResolvedValue({
      data: onboarding({
        step: 6,
        shop: SHOP,
        checklist: { items: [], done: 0, total: 7, complete: false },
      }),
      error: null,
    });
    await render(<ShopLive />);
    await screen.findByRole('button', { name: 'Share on TikTok' });
    expect(imagesIn('Share on TikTok')).toEqual([TIKTOK]);
  });

  it('Share your shop: the TikTok tab', async () => {
    mockShare.mockResolvedValue({
      data: {
        shop: { name: 'Amani Styles', slug: 'amani-styles', logoUrl: null, linkPrefix: 'oda/' },
        latest: null,
        productCount: 0,
        channels: ['tiktok', 'whatsapp'],
      },
      error: null,
    });
    await render(<ShareScreen />);
    await screen.findByRole('tab', { name: 'TikTok' });
    expect(imagesIn('TikTok')).toEqual([TIKTOK]);
  });

  it('Shop profile: the TikTok row', async () => {
    mockProfile.mockResolvedValue({
      data: {
        name: 'Amani Styles',
        slug: 'amani-styles',
        url: SHOP.url,
        linkPrefix: 'oda.example/',
        logoPath: null,
        logoUrl: null,
        about: null,
        locationLabel: null,
        whatsappPhone: SHOP.whatsappPhone,
        callsEnabled: true,
        tiktokHandle: 'amani.styles',
        instagramHandle: null,
      },
      error: null,
    });
    await render(<ShopProfileScreen />);
    await screen.findByText('TikTok');
    expect(imagesIn(/^TikTok/)).toEqual([TIKTOK]);
  });
});
