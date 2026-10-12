import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { ApiError } from '@/api';
import type { Details } from '@/settings/api';
import { signOutOnThisPhone } from '@/settings/signOut';
import { clearSettingsCaches } from '@/settings/useLoaded';
import DeleteAccount from '../../../app/settings/delete';
import YourDetails from '../../../app/settings/details';
import ChangePassword from '../../../app/settings/password';

type Answer<T> = Promise<{ data: T | null; error: ApiError | null }>;
const mockDetails = jest.fn<() => Answer<Details>>();
const mockSaveDetails = jest.fn<(body: unknown) => Answer<Details>>();
const mockChangePassword = jest.fn<(body: unknown) => Promise<{ data: unknown; error: unknown }>>();
const mockDeleteAccount = jest.fn<() => Answer<Record<string, never>>>();

jest.mock('@/settings/api', () => ({
  settingsApi: {
    details: () => mockDetails(),
    saveDetails: (body: unknown) => mockSaveDetails(body),
    deleteAccount: () => mockDeleteAccount(),
  },
  changePassword: (body: unknown) => mockChangePassword(body),
}));

jest.mock('@/settings/signOut', () => ({
  signOutOnThisPhone: jest.fn(async () => undefined),
}));

const DETAILS: Details = {
  email: 'amani@example.test',
  firstName: 'Amani',
  lastName: 'Otieno',
  recoveryPhone: null,
  memberSince: '2026-03-01T09:00:00.000Z',
  shopName: 'Amani Styles',
};

beforeEach(() => {
  jest.clearAllMocks();
  clearSettingsCaches();
});

describe('Settings · Your details', () => {
  it('saves the changed name and says so', async () => {
    mockDetails.mockResolvedValue({ data: DETAILS, error: null });
    mockSaveDetails.mockResolvedValue({ data: { ...DETAILS, lastName: 'Wambui' }, error: null });
    const user = userEvent.setup();
    await render(<YourDetails />);
    const last = await screen.findByLabelText('Last name');
    expect(screen.getByLabelText('Email')).toHaveDisplayValue('amani@example.test');
    await user.clear(last);
    await user.type(last, 'Wambui');
    await user.type(screen.getByLabelText('Phone number'), '712345678');
    await user.press(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Saved.')).toBeTruthy();
    expect(mockSaveDetails).toHaveBeenCalledWith({
      firstName: 'Amani',
      lastName: 'Wambui',
      recoveryPhone: '+254712345678',
    });
  });

  it('shows the server’s field error under the phone number', async () => {
    mockDetails.mockResolvedValue({ data: DETAILS, error: null });
    mockSaveDetails.mockResolvedValue({
      data: null,
      error: {
        status: 400,
        code: 'invalid',
        message: 'Check the highlighted fields.',
        fields: { recoveryPhone: 'Enter a Kenyan mobile number, e.g. 712 345 678.' },
      },
    });
    const user = userEvent.setup();
    await render(<YourDetails />);
    await user.type(await screen.findByLabelText('Phone number'), '12');
    await user.press(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Enter a Kenyan mobile number, e.g. 712 345 678.')).toBeTruthy();
    expect(screen.getByText('Check the highlighted fields.')).toBeTruthy();
    expect(screen.queryByText('Saved.')).toBeNull();
  });
});

describe('Settings · Change your password', () => {
  it('checks the form before calling the server', async () => {
    const user = userEvent.setup();
    await render(<ChangePassword />);
    const update = screen.getByRole('button', { name: 'Update password' });

    await user.press(update);
    expect(await screen.findByText('Enter your current password.')).toBeTruthy();

    await user.type(screen.getByLabelText('Current password'), 'old-pass-1');
    await user.type(screen.getByLabelText('New password'), 'short1');
    await user.press(update);
    expect(await screen.findByText('Use at least 8 characters.')).toBeTruthy();

    await user.clear(screen.getByLabelText('New password'));
    await user.type(screen.getByLabelText('New password'), 'new-pass-22');
    await user.type(screen.getByLabelText('Confirm new password'), 'new-pass-23');
    await user.press(update);
    expect(await screen.findByText("The two new passwords don't match.")).toBeTruthy();
    expect(mockChangePassword).not.toHaveBeenCalled();
  });

  it('a wrong current password shows under that field', async () => {
    mockChangePassword.mockResolvedValue({
      data: null,
      error: { status: 400, code: 'INVALID_PASSWORD', message: 'Invalid password' },
    });
    const user = userEvent.setup();
    await render(<ChangePassword />);
    await user.type(screen.getByLabelText('Current password'), 'old-pass-1');
    await user.type(screen.getByLabelText('New password'), 'new-pass-22');
    await user.type(screen.getByLabelText('Confirm new password'), 'new-pass-22');
    await user.press(screen.getByRole('button', { name: 'Update password' }));
    expect(await screen.findByText("That isn't your current password. Try again.")).toBeTruthy();
    await waitFor(() =>
      expect(mockChangePassword).toHaveBeenCalledWith({
        currentPassword: 'old-pass-1',
        newPassword: 'new-pass-22',
        revokeOtherSessions: true,
      }),
    );
  });
});

describe('Settings · Delete account', () => {
  it('Delete stays off until DELETE is typed, then deletes, signs out and leaves', async () => {
    mockDeleteAccount.mockResolvedValue({ data: {}, error: null });
    const user = userEvent.setup();
    await render(<DeleteAccount />);
    const remove = screen.getByRole('button', { name: 'Delete my account' });
    expect(remove).toBeDisabled();
    const field = screen.getByLabelText('Type DELETE to confirm');
    await user.type(field, 'delete');
    expect(remove).toBeDisabled();
    await user.clear(field);
    await user.type(field, 'DELETE');
    expect(remove).toBeEnabled();
    await user.press(remove);
    expect(mockDeleteAccount).toHaveBeenCalledTimes(1);
    // Welcome says it's done, in oda's notice sheet (decision #109 a).
    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith({
        pathname: '/welcome',
        params: { deleted: '1' },
      }),
    );
    expect(signOutOnThisPhone).toHaveBeenCalledTimes(1);
  });

  it('a failed delete says so and keeps the seller signed in', async () => {
    mockDeleteAccount.mockResolvedValue({ data: null, error: { status: 0, code: 'UNREACHABLE' } });
    const user = userEvent.setup();
    await render(<DeleteAccount />);
    await user.type(screen.getByLabelText('Type DELETE to confirm'), 'DELETE');
    await user.press(screen.getByRole('button', { name: 'Delete my account' }));
    expect(await screen.findByText("Couldn't reach oda. Try again.")).toBeTruthy();
    expect(signOutOnThisPhone).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
  });
});
