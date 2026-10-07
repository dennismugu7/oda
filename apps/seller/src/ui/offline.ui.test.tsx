import { describe, expect, it } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';
import { OfflineBar } from './offline';

describe('OfflineBar', () => {
  it('says saved data is shown', async () => {
    await render(<OfflineBar />);
    expect(screen.getByText('You’re offline · showing saved data')).toBeTruthy();
  });

  it('or that nothing is saved yet', async () => {
    await render(<OfflineBar saved={false} />);
    expect(screen.getByText('You’re offline. Connect to load this.')).toBeTruthy();
  });
});
