import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { render, screen, userEvent } from '@testing-library/react-native';
import { Linking } from 'react-native';
import type { ApiError } from '@/api';
import type { Support } from '@/insights/api';
import { clearSettingsCaches } from '@/settings/useLoaded';
import { SuspendedBanner } from './suspended';

const mockSupport = jest.fn<() => Promise<{ data: Support | null; error: ApiError | null }>>();

jest.mock('@/insights/api', () => ({
  growApi: { support: () => mockSupport() },
}));

let openURL: jest.SpiedFunction<typeof Linking.openURL>;

beforeEach(() => {
  jest.clearAllMocks();
  clearSettingsCaches();
  openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
});

describe('SuspendedBanner', () => {
  it('names the default support email while the server hasn’t answered (offline)', async () => {
    mockSupport.mockResolvedValue({ data: null, error: { status: 0, code: 'OFFLINE' } });
    await render(<SuspendedBanner />);
    expect(
      await screen.findByText('Your shop is suspended. Email support@mugu-labs.com'),
    ).toBeTruthy();
    expect(
      screen.getByText('Buyers can’t see your shop. You can still finish your open orders.'),
    ).toBeTruthy();
  });

  it('tapping it opens an email to support', async () => {
    mockSupport.mockResolvedValue({ data: null, error: { status: 0, code: 'OFFLINE' } });
    const user = userEvent.setup();
    await render(<SuspendedBanner />);
    await user.press(screen.getByRole('button', { name: /^Your shop is suspended/ }));
    expect(openURL).toHaveBeenCalledWith(
      'mailto:support@mugu-labs.com?subject=My%20oda%20shop%20is%20suspended',
    );
  });

  it('uses the support address the server sends', async () => {
    mockSupport.mockResolvedValue({
      data: { email: 'help@oda.example', whatsapp: null },
      error: null,
    });
    const user = userEvent.setup();
    await render(<SuspendedBanner />);
    expect(await screen.findByText('Your shop is suspended. Email help@oda.example')).toBeTruthy();
    await user.press(screen.getByRole('button', { name: /^Your shop is suspended/ }));
    expect(openURL).toHaveBeenCalledWith(
      'mailto:help@oda.example?subject=My%20oda%20shop%20is%20suspended',
    );
  });
});
