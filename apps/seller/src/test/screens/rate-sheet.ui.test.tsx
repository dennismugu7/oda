import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import * as StoreReview from 'expo-store-review';
import { RateSheet } from '@/settings/RateSheet';

jest.mock('expo-store-review', () => ({
  storeUrl: jest.fn(() => null),
  hasAction: jest.fn(async () => false),
  requestReview: jest.fn(async () => undefined),
}));

const onClose = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(StoreReview.storeUrl).mockReturnValue(null);
  jest.mocked(StoreReview.hasAction).mockResolvedValue(false);
});

describe('Rate the app', () => {
  it('starts at 5 stars: “Rate on Play Store”, and says when oda isn’t on Play yet', async () => {
    const user = userEvent.setup();
    await render(<RateSheet visible onClose={onClose} />);
    expect(screen.getByText('Enjoying oda?')).toBeTruthy();
    expect(screen.getByText('Love it!')).toBeTruthy();
    await user.press(screen.getByRole('button', { name: 'Rate on Play Store' }));
    expect(await screen.findByText(/oda isn’t on Google Play yet/)).toBeTruthy();
    expect(StoreReview.requestReview).not.toHaveBeenCalled();
    await user.press(screen.getByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('5 stars on Google Play asks Play for the review', async () => {
    jest.mocked(StoreReview.storeUrl).mockReturnValue('https://play.google.com/store/apps/x');
    jest.mocked(StoreReview.hasAction).mockResolvedValue(true);
    const user = userEvent.setup();
    await render(<RateSheet visible onClose={onClose} />);
    await user.press(screen.getByRole('button', { name: 'Rate on Play Store' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(StoreReview.requestReview).toHaveBeenCalledTimes(1);
  });

  it('3 stars or fewer: “Tell us what to improve” opens feedback', async () => {
    const user = userEvent.setup();
    await render(<RateSheet visible onClose={onClose} />);
    await user.press(screen.getByRole('button', { name: '3 stars' }));
    expect(screen.getByText('It’s okay')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Rate on Play Store' })).toBeNull();
    await user.press(screen.getByRole('button', { name: '1 star' }));
    expect(screen.getByText('Not good')).toBeTruthy();
    await user.press(screen.getByRole('button', { name: 'Tell us what to improve' }));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/settings/feedback',
      params: { kind: 'idea' },
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(StoreReview.requestReview).not.toHaveBeenCalled();
  });
});
