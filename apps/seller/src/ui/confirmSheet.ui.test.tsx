import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen, userEvent } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';
import { colors } from '@/theme';
import { ConfirmSheet, useConfirm } from './confirmSheet';

// oda's own confirmation instead of Android's alert (decision #109 a).

const LONG = 'wanjiku.kamau.wambui.njeri.wanjiru.amani.styles.nairobi@longdomain-example.co.ke';

function sheet(over: Partial<Parameters<typeof ConfirmSheet>[0]> = {}) {
  const onConfirm = jest.fn();
  const onClose = jest.fn();
  return {
    onConfirm,
    onClose,
    ui: (
      <ConfirmSheet
        visible
        title="Log out?"
        message={`Are you sure you want to log out of ${LONG}?`}
        confirmLabel="Log out"
        destructive
        onConfirm={onConfirm}
        onClose={onClose}
        {...over}
      />
    ),
  };
}

describe('ConfirmSheet', () => {
  it('title, the whole message (wrapped, never cut), the main button and Cancel', async () => {
    const s = sheet();
    await render(s.ui);
    expect(screen.getByRole('header', { name: 'Log out?' })).toBeTruthy();
    const message = screen.getByText(`Are you sure you want to log out of ${LONG}?`);
    expect(message.props.numberOfLines).toBeUndefined();
    expect(screen.getByRole('button', { name: 'Log out' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
  });

  it('the main button closes, then runs the action', async () => {
    const s = sheet();
    await render(s.ui);
    await userEvent.press(screen.getByRole('button', { name: 'Log out' }));
    expect(s.onClose).toHaveBeenCalledTimes(1);
    expect(s.onConfirm).toHaveBeenCalledTimes(1);
  });

  it('Cancel, a tap outside and the back button only close', async () => {
    const s = sheet({ cancelLabel: 'Keep editing' });
    await render(s.ui);
    await userEvent.press(screen.getByRole('button', { name: 'Keep editing' }));
    // The backdrop sits outside the modal sheet, so screen readers skip it (Cancel is there).
    await userEvent.press(
      screen.getByRole('button', { name: 'Close', includeHiddenElements: true }),
    );
    // Android's back button.
    await fireEvent(
      screen.getByTestId('confirm-sheet', { includeHiddenElements: true }),
      'requestClose',
    );
    expect(s.onClose).toHaveBeenCalledTimes(3);
    expect(s.onConfirm).not.toHaveBeenCalled();
  });

  it('destructive actions get the red button; others the usual one', async () => {
    const red = sheet();
    const view = await render(red.ui);
    expect(screen.getByRole('button', { name: 'Log out' })).toHaveStyle({
      backgroundColor: colors.danger,
    });
    await view.rerender(sheet({ destructive: false, confirmLabel: 'Pause shop' }).ui);
    expect(screen.getByRole('button', { name: 'Pause shop' })).not.toHaveStyle({
      backgroundColor: colors.danger,
    });
  });

  it('a notice has only its main button', async () => {
    const s = sheet({ notice: true, destructive: false, confirmLabel: 'OK' });
    await render(s.ui);
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
    await userEvent.press(screen.getByRole('button', { name: 'OK' }));
    expect(s.onClose).toHaveBeenCalledTimes(1);
  });

  it('nothing shows while not visible', async () => {
    await render(sheet({ visible: false }).ui);
    expect(screen.queryByRole('header', { name: 'Log out?' })).toBeNull();
  });
});

describe('useConfirm', () => {
  function Screen({ onYes }: { onYes: () => void }) {
    const confirm = useConfirm();
    return (
      <>
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            confirm.ask({
              title: 'Delete Kilimani?',
              message: 'Past orders keep the area’s name.',
              confirmLabel: 'Delete',
              destructive: true,
              onConfirm: onYes,
            })
          }
        >
          <Text>Delete area</Text>
        </Pressable>
        {confirm.sheet}
      </>
    );
  }

  it('asks, then runs the action once and closes', async () => {
    const onYes = jest.fn();
    await render(<Screen onYes={onYes} />);
    expect(screen.queryByRole('header', { name: 'Delete Kilimani?' })).toBeNull();
    await userEvent.press(screen.getByRole('button', { name: 'Delete area' }));
    expect(screen.getByRole('header', { name: 'Delete Kilimani?' })).toBeTruthy();
    await userEvent.press(screen.getByRole('button', { name: 'Delete' }));
    expect(onYes).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('header', { name: 'Delete Kilimani?' })).toBeNull();
  });

  it('Cancel closes without the action', async () => {
    const onYes = jest.fn();
    await render(<Screen onYes={onYes} />);
    await userEvent.press(screen.getByRole('button', { name: 'Delete area' }));
    await userEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(onYes).not.toHaveBeenCalled();
    expect(screen.queryByRole('header', { name: 'Delete Kilimani?' })).toBeNull();
  });
});
