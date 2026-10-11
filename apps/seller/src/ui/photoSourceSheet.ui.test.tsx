import { describe, expect, it, jest } from '@jest/globals';
import { render, screen, userEvent } from '@testing-library/react-native';
import { PhotoSourceSheet } from './photoSourceSheet';

describe('PhotoSourceSheet', () => {
  it('offers the camera and the gallery, and closes before picking', async () => {
    const onPick = jest.fn();
    const onClose = jest.fn();
    await render(<PhotoSourceSheet visible onPick={onPick} onClose={onClose} />);
    expect(screen.getByRole('header', { name: 'Add photos' })).toBeTruthy();

    await userEvent.press(screen.getByRole('button', { name: 'Take a photo' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith('camera');

    await userEvent.press(screen.getByRole('button', { name: 'Choose from gallery' }));
    expect(onPick).toHaveBeenLastCalledWith('library');
  });

  it('Cancel only closes', async () => {
    const onPick = jest.fn();
    const onClose = jest.fn();
    await render(
      <PhotoSourceSheet visible title="Retake photo" onPick={onPick} onClose={onClose} />,
    );
    expect(screen.getByRole('header', { name: 'Retake photo' })).toBeTruthy();
    await userEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onPick).not.toHaveBeenCalled();
  });
});
