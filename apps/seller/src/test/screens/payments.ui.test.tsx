import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { ApiError } from '@/api';
import {
  paymentsCache,
  type AccountFields,
  type PaymentAccount,
  type Payments,
} from '@/settings/api';
import PaymentsScreen from '../../../app/payments';
import AccountScreen from '../../../app/payments/account';

type Answer<T> = Promise<{ data: T | null; error: ApiError | null }>;
const mockPayments = jest.fn<() => Answer<Payments>>();
const mockPaymentSettings = jest.fn<(body: unknown) => Answer<Payments>>();
const mockAddAccount = jest.fn<(body: AccountFields) => Answer<Payments>>();
const mockActivate = jest.fn<(id: string) => Answer<Payments>>();

jest.mock('@/settings/api', () => {
  let cached: unknown = null;
  return {
    settingsApi: {
      payments: () => mockPayments(),
      paymentSettings: (body: unknown) => mockPaymentSettings(body),
      addAccount: (body: AccountFields) => mockAddAccount(body),
      activateAccount: (id: string) => mockActivate(id),
    },
    paymentsCache: {
      get: () => cached,
      set: (value: unknown) => {
        cached = value;
      },
    },
  };
});

const TILL: PaymentAccount = {
  id: 'acc_1',
  type: 'till',
  number: '123456',
  accountName: 'AMANI STYLES',
  accountRefMode: null,
  accountRef: null,
  isActive: true,
};

const PAYBILL: PaymentAccount = {
  id: 'acc_2',
  type: 'paybill',
  number: '247247',
  accountName: 'AMANI STYLES',
  accountRefMode: 'order_number',
  accountRef: null,
  isActive: false,
};

const PAYMENTS: Payments = {
  accounts: [TILL],
  acceptsPayBefore: true,
  acceptsPayOnDelivery: true,
};

beforeEach(() => {
  jest.clearAllMocks();
  paymentsCache.set(null);
});

describe('Payments', () => {
  it('shows only the loading state, then the account buyers see at checkout', async () => {
    let answer: (value: { data: Payments; error: null }) => void = () => {};
    mockPayments.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    await render(<PaymentsScreen />);
    expect(screen.queryByText('YOUR M-PESA ACCOUNT')).toBeNull();
    answer({ data: PAYMENTS, error: null });
    expect(await screen.findByText('YOUR M-PESA ACCOUNT')).toBeTruthy();
    expect(screen.getByText('Buy Goods Till')).toBeTruthy();
    expect(screen.getByText('Shown at checkout')).toBeTruthy();
    expect(screen.getByText('123 456')).toBeTruthy();
    expect(screen.getByText('“Pay KSh 2,500 to Till 123 456, AMANI STYLES”')).toBeTruthy();
  });

  it('with no account: says buyers can only pay on delivery, and offers to add one', async () => {
    mockPayments.mockResolvedValue({ data: { ...PAYMENTS, accounts: [] }, error: null });
    const user = userEvent.setup();
    await render(<PaymentsScreen />);
    expect(await screen.findByText(/No M-Pesa account yet, so buyers can only pay/)).toBeTruthy();
    expect(
      screen.getByText('Add an M-Pesa account so buyers can pay before delivery.'),
    ).toBeTruthy();
    await user.press(screen.getByRole('button', { name: /Add an M-Pesa account/ }));
    expect(router.push).toHaveBeenCalledWith('/payments/account');
  });

  it('the “On delivery” and “Before delivery” toggles save at once', async () => {
    mockPayments.mockResolvedValue({ data: PAYMENTS, error: null });
    mockPaymentSettings
      .mockResolvedValueOnce({ data: { ...PAYMENTS, acceptsPayOnDelivery: false }, error: null })
      .mockResolvedValueOnce({
        data: { ...PAYMENTS, acceptsPayOnDelivery: true, acceptsPayBefore: false },
        error: null,
      });
    await render(<PaymentsScreen />);
    await fireEvent(await screen.findByLabelText('On delivery'), 'valueChange', false);
    expect(mockPaymentSettings).toHaveBeenCalledWith({ acceptsPayOnDelivery: false });
    await waitFor(() => expect(screen.getByLabelText('On delivery')).toHaveProp('value', false));
    await fireEvent(screen.getByLabelText('Before delivery'), 'valueChange', false);
    expect(mockPaymentSettings).toHaveBeenLastCalledWith({ acceptsPayBefore: false });
    await waitFor(() =>
      expect(screen.getByLabelText('Before delivery')).toHaveProp('value', false),
    );
  });

  it('a saved account can be shown at checkout', async () => {
    mockPayments.mockResolvedValue({
      data: { ...PAYMENTS, accounts: [TILL, PAYBILL] },
      error: null,
    });
    mockActivate.mockResolvedValue({
      data: {
        ...PAYMENTS,
        accounts: [
          { ...TILL, isActive: false },
          { ...PAYBILL, isActive: true },
        ],
      },
      error: null,
    });
    const user = userEvent.setup();
    await render(<PaymentsScreen />);
    expect(await screen.findByText('YOUR M-PESA ACCOUNTS')).toBeTruthy();
    const [till, paybill] = screen.getAllByRole('radio');
    expect(till).toBeSelected();
    expect(paybill).not.toBeSelected();
    expect(screen.getByText('Order number')).toBeTruthy();
    await user.press(paybill!);
    await user.press(screen.getByRole('button', { name: /Show this one at checkout/ }));
    expect(mockActivate).toHaveBeenCalledWith('acc_2');
    expect(
      await screen.findByText(
        '“Pay KSh 2,500 to Paybill 247 247, account: their order number, AMANI STYLES”',
      ),
    ).toBeTruthy();
    expect(screen.getAllByRole('radio')[1]).toBeSelected();
  });

  it('offline with nothing saved: says so and offers Try again', async () => {
    mockPayments.mockResolvedValue({ data: null, error: { status: 0, code: 'OFFLINE' } });
    await render(<PaymentsScreen />);
    expect(await screen.findByText('You’re offline. Connect to load this.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });
});

describe('Payments · add an account', () => {
  it('adds a Paybill account paid with the order number', async () => {
    mockAddAccount.mockResolvedValue({
      data: { ...PAYMENTS, accounts: [TILL, PAYBILL] },
      error: null,
    });
    const user = userEvent.setup();
    await render(<AccountScreen />);
    await user.press(screen.getByRole('radio', { name: 'Paybill' }));
    expect(screen.getByText('A business or bank Paybill number.')).toBeTruthy();
    await user.type(screen.getByLabelText('Paybill number'), '247247');
    await user.press(screen.getByRole('checkbox', { name: 'The order number' }));
    expect(screen.getByText('Each buyer enters their order number, e.g. 1042.')).toBeTruthy();
    expect(screen.queryByLabelText('Account number')).toBeNull();
    await user.type(screen.getByLabelText('Name on the account'), 'AMANI STYLES');
    await user.press(screen.getByRole('button', { name: 'Save account' }));
    expect(mockAddAccount).toHaveBeenCalledWith({
      type: 'paybill',
      number: '247247',
      accountName: 'AMANI STYLES',
      accountRefMode: 'order_number',
      accountRef: null,
    });
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(paymentsCache.get()?.accounts).toHaveLength(2);
  });

  it('shows the server’s field error under the number', async () => {
    mockAddAccount.mockResolvedValue({
      data: null,
      error: {
        status: 400,
        code: 'invalid',
        message: 'Check the highlighted fields.',
        fields: { number: 'Enter a Till number of 5 to 7 digits.' },
      },
    });
    const user = userEvent.setup();
    await render(<AccountScreen />);
    await user.type(screen.getByLabelText('Till number'), '12');
    await user.type(screen.getByLabelText('Name on the account'), 'AMANI STYLES');
    await user.press(screen.getByRole('button', { name: 'Save account' }));
    expect(await screen.findByText('Enter a Till number of 5 to 7 digits.')).toBeTruthy();
    expect(screen.getByText('Check the highlighted fields.')).toBeTruthy();
    expect(router.back).not.toHaveBeenCalled();
  });
});
