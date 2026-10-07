import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { render, screen, userEvent } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';
import type { ApiError } from '@/api';
import type { ShareData } from '@/share/plan';
import { clearSettingsCaches } from '@/settings/useLoaded';
import ShareScreen from '../../../app/share';

const mockShare = jest.fn<() => Promise<{ data: ShareData | null; error: ApiError | null }>>();

jest.mock('@/insights/api', () => ({
  growApi: { share: () => mockShare() },
}));
jest.mock('@/onboarding/api', () => ({
  onboardingApi: { tick: jest.fn(async () => ({ data: null, error: null })) },
}));

const DATA: ShareData = {
  shop: {
    name: 'Amani Styles',
    slug: 'amani-styles',
    logoUrl: null,
    linkPrefix: 'oda.example/',
  },
  latest: {
    id: 'p1',
    name: 'Ankara dress',
    price: 2500,
    photoUrl: 'https://example.test/p1.jpg',
  },
  productCount: 12,
  channels: ['tiktok', 'whatsapp'],
};

beforeEach(() => {
  jest.clearAllMocks();
  clearSettingsCaches();
  mockShare.mockResolvedValue({ data: DATA, error: null });
});

describe('Share your shop', () => {
  it('starts on the seller’s first channel; tapping a tab switches it', async () => {
    const user = userEvent.setup();
    await render(<ShareScreen />);
    const tiktok = await screen.findByRole('tab', { name: 'TikTok' });
    expect(tiktok).toBeSelected();
    expect(screen.getByRole('tab', { name: 'WhatsApp' })).not.toBeSelected();
    expect(screen.getAllByRole('tab')).toHaveLength(5);

    await user.press(screen.getByRole('tab', { name: 'Instagram' }));
    expect(screen.getByRole('tab', { name: 'Instagram' })).toBeSelected();
    expect(screen.getByRole('tab', { name: 'TikTok' })).not.toBeSelected();
    expect(screen.getByText('Orders from this post will show as "via Instagram"')).toBeTruthy();
  });

  it('the image choice radios: "New in" first, then "Collection" when tapped', async () => {
    const user = userEvent.setup();
    await render(<ShareScreen />);
    const newIn = await screen.findByRole('radio', { name: 'New in image' });
    const collection = screen.getByRole('radio', { name: 'Collection image' });
    expect(newIn).toBeChecked();
    expect(collection).not.toBeChecked();

    await user.press(collection);
    expect(screen.getByRole('radio', { name: 'Collection image' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'New in image' })).not.toBeChecked();
  });

  it('offers only "Collection" when no product has a photo', async () => {
    mockShare.mockResolvedValue({ data: { ...DATA, latest: null }, error: null });
    await render(<ShareScreen />);
    expect(await screen.findByRole('radio', { name: 'Collection image' })).toBeChecked();
    expect(screen.queryByRole('radio', { name: 'New in image' })).toBeNull();
    expect(screen.getByText('Add a product with a photo to share it as “New in”.')).toBeTruthy();
  });

  it('Copy your link copies the link tagged for the channel', async () => {
    const user = userEvent.setup();
    await render(<ShareScreen />);
    await user.press(await screen.findByRole('button', { name: 'Copy your link' }));
    expect(Clipboard.setStringAsync).toHaveBeenCalledTimes(1);
    expect(jest.mocked(Clipboard.setStringAsync).mock.calls[0]?.[0]).toMatch(
      /\/amani-styles\?s=tt$/,
    );
    expect(await screen.findByText('Link copied.')).toBeTruthy();
  });
});
