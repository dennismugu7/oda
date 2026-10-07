import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { render, screen, userEvent } from '@testing-library/react-native';
import { Linking } from 'react-native';
import type { ApiError } from '@/api';
import type { Support } from '@/insights/api';
import { clearSettingsCaches } from '@/settings/useLoaded';
import HelpScreen from '../../../app/help/index';

const mockSupport = jest.fn<() => Promise<{ data: Support | null; error: ApiError | null }>>();

jest.mock('@/insights/api', () => ({
  growApi: { support: () => mockSupport() },
}));
// The version comes from the native build and the EAS Update id.
jest.mock('@/sentry', () => ({
  appVersion: () => ({ version: '0.3.0', update: '1a2b3c4d', channel: 'preview' }),
  canSendTestError: false,
  sendTestError: () => {},
}));

beforeEach(() => {
  jest.clearAllMocks();
  clearSettingsCaches();
  mockSupport.mockResolvedValue({ data: null, error: { status: 0, code: 'OFFLINE' } });
});

describe('Help and support', () => {
  it('lists every guide and the support contact', async () => {
    await render(<HelpScreen />);
    expect(screen.getByText('GUIDES')).toBeTruthy();
    expect(screen.getByText('Getting paid')).toBeTruthy();
    expect(screen.getByText('Reviews')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Email oda support' })).toBeTruthy();
    // No WhatsApp number configured: no chat button.
    expect(screen.queryByRole('button', { name: 'Chat with oda support' })).toBeNull();
  });

  it('searching "refund" finds the Getting paid guide first and hides the rest', async () => {
    const user = userEvent.setup();
    await render(<HelpScreen />);
    await user.type(screen.getByLabelText('Search help'), 'refund');
    expect(await screen.findByText('RESULTS FOR "REFUND"')).toBeTruthy();
    const titles = screen.getAllByText(/^(Getting paid|Your orders|Reviews|Delivery and pickup)$/);
    expect(titles[0]).toHaveTextContent('Getting paid');
    expect(screen.queryByText('Reviews')).toBeNull();
    expect(screen.queryByText('Delivery and pickup')).toBeNull();
    // The contact card steps aside while searching.
    expect(screen.queryByRole('button', { name: 'Email oda support' })).toBeNull();
  });

  it('says when no guide matches', async () => {
    const user = userEvent.setup();
    await render(<HelpScreen />);
    await user.type(screen.getByLabelText('Search help'), 'zebra');
    expect(
      await screen.findByText(
        'No guide matches “zebra”. Try another word, or email us at support@mugu-labs.com.',
      ),
    ).toBeTruthy();
  });

  it('Email oda support opens the mail app to the support address', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const user = userEvent.setup();
    await render(<HelpScreen />);
    await user.press(screen.getByRole('button', { name: 'Email oda support' }));
    expect(openURL).toHaveBeenCalledWith('mailto:support@mugu-labs.com?subject=oda%20help');
    openURL.mockRestore();
  });

  it('shows the app version line', async () => {
    await render(<HelpScreen />);
    expect(screen.getByText('App version 0.3.0 · update 1a2b3c4d')).toBeTruthy();
  });
});
