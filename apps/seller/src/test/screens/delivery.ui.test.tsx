import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { ApiError } from '@/api';
import {
  deliveryCache,
  type AreaFields,
  type Delivery,
  type DeliverySettings,
} from '@/delivery/api';
import DeliveryScreen from '../../../app/delivery';
import AreaScreen from '../../../app/delivery/area';

type Answer<T> = Promise<{ data: T | null; error: ApiError | null }>;
const mockGet = jest.fn<() => Answer<Delivery>>();
const mockSettings = jest.fn<(body: DeliverySettings) => Answer<Delivery>>();
const mockCreateArea = jest.fn<(body: AreaFields) => Answer<Delivery>>();
const mockTick = jest.fn<(item: string) => Answer<unknown>>();

jest.mock('@/onboarding/api', () => ({
  onboardingApi: { tick: (item: string) => mockTick(item) },
}));

jest.mock('@/delivery/api', () => {
  let cached: unknown = null;
  return {
    deliveryApi: {
      get: () => mockGet(),
      settings: (body: DeliverySettings) => mockSettings(body),
      createArea: (body: AreaFields) => mockCreateArea(body),
    },
    deliveryCache: {
      get: () => cached,
      set: (value: unknown) => {
        cached = value;
      },
    },
  };
});

const EMPTY: Delivery = {
  areas: [],
  pickupEnabled: false,
  pickupLocation: null,
  pickupHours: null,
  freeDeliveryThreshold: null,
  hasDeliveryOption: false,
};

const WESTLANDS = {
  id: 'a1',
  name: 'Westlands',
  fee: 200,
  method: 'rider' as const,
  etaLabel: 'Same day',
  freeDeliveryEligible: false,
  position: 0,
};

beforeEach(() => {
  jest.clearAllMocks();
  deliveryCache.set(null);
});

describe('Delivery', () => {
  it('shows only the loading state, then says delivery is optional (decision #110)', async () => {
    let answer: (value: { data: Delivery; error: null }) => void = () => {};
    mockGet.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const user = userEvent.setup();
    await render(<DeliveryScreen />);
    expect(screen.queryByText('DELIVERY AREAS')).toBeNull();
    answer({ data: EMPTY, error: null });
    expect(await screen.findByRole('header', { name: 'Delivery is optional' })).toBeTruthy();
    expect(
      screen.getByText(
        'Without delivery areas or pickup, buyers can still order. You arrange delivery with them, usually on WhatsApp.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/can’t order/)).toBeNull();
    expect(
      screen.getByText(
        'No delivery areas yet. Add the places you deliver to and what each one costs.',
      ),
    ).toBeTruthy();
    await user.press(screen.getByRole('button', { name: /Add delivery area/ }));
    expect(router.push).toHaveBeenCalledWith('/delivery/area');
  });

  it('"I’ll arrange delivery with buyers" ticks the checklist item (decision #110 e)', async () => {
    mockGet.mockResolvedValue({ data: EMPTY, error: null });
    mockTick.mockResolvedValue({ data: { step: null, done: true, checklist: null }, error: null });
    const user = userEvent.setup();
    await render(<DeliveryScreen />);
    await user.press(
      await screen.findByRole('button', { name: 'I’ll arrange delivery with buyers' }),
    );
    expect(mockTick).toHaveBeenCalledWith('arrange_delivery');
    expect(await screen.findByText('You’ll arrange delivery with buyers')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'I’ll arrange delivery with buyers' })).toBeNull();
  });

  it('already tapped: no button, just the tick', async () => {
    mockGet.mockResolvedValue({ data: { ...EMPTY, arrangeDelivery: true }, error: null });
    await render(<DeliveryScreen />);
    expect(await screen.findByText('You’ll arrange delivery with buyers')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'I’ll arrange delivery with buyers' })).toBeNull();
  });

  it('lists the areas without the "optional" card', async () => {
    mockGet.mockResolvedValue({
      data: { ...EMPTY, areas: [WESTLANDS], hasDeliveryOption: true },
      error: null,
    });
    const user = userEvent.setup();
    await render(<DeliveryScreen />);
    const row = await screen.findByRole('button', {
      name: 'Westlands, By rider, KSh 200, Same day',
    });
    expect(screen.queryByRole('header', { name: 'Delivery is optional' })).toBeNull();
    await user.press(row);
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/delivery/area',
      params: { id: 'a1' },
    });
  });

  it('turning pickup on asks where first, then saves it', async () => {
    mockGet.mockResolvedValue({ data: EMPTY, error: null });
    mockSettings.mockResolvedValue({
      data: {
        ...EMPTY,
        pickupEnabled: true,
        pickupLocation: 'Yaya Centre',
        pickupHours: 'Mon–Sat 9am–6pm',
        hasDeliveryOption: true,
      },
      error: null,
    });
    const user = userEvent.setup();
    await render(<DeliveryScreen />);
    await fireEvent(await screen.findByLabelText('Buyers can pick up'), 'valueChange', true);
    expect(mockSettings).not.toHaveBeenCalled();
    await user.press(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Enter where buyers pick up their orders.')).toBeTruthy();
    expect(mockSettings).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('Where buyers pick up'), 'Yaya Centre');
    await user.type(screen.getByLabelText('Pickup hours'), 'Mon–Sat 9am–6pm');
    await user.press(screen.getByRole('button', { name: 'Save' }));
    expect(mockSettings).toHaveBeenCalledWith({
      pickupEnabled: true,
      pickupLocation: 'Yaya Centre',
      pickupHours: 'Mon–Sat 9am–6pm',
    });
    await waitFor(() =>
      expect(screen.queryByRole('header', { name: 'Delivery is optional' })).toBeNull(),
    );
    expect(screen.queryByLabelText('Where buyers pick up')).toBeNull();
  });

  it('turning off the only option needs no warning: buyers still order (decision #110)', async () => {
    mockGet.mockResolvedValue({
      data: {
        ...EMPTY,
        pickupEnabled: true,
        pickupLocation: 'Yaya Centre',
        hasDeliveryOption: true,
      },
      error: null,
    });
    await render(<DeliveryScreen />);
    mockSettings.mockResolvedValue({ data: EMPTY, error: null });
    await fireEvent(await screen.findByLabelText('Buyers can pick up'), 'valueChange', false);
    expect(screen.queryByRole('header', { name: 'Stop taking orders?' })).toBeNull();
    await waitFor(() => expect(mockSettings).toHaveBeenCalledWith({ pickupEnabled: false }));
    expect(await screen.findByRole('header', { name: 'Delivery is optional' })).toBeTruthy();
  });

  it('offline with nothing saved: says so and offers Try again', async () => {
    mockGet.mockResolvedValue({ data: null, error: { status: 0, code: 'OFFLINE' } });
    await render(<DeliveryScreen />);
    expect(await screen.findByText('You’re offline. Connect to load this.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });
});

describe('Delivery · add an area', () => {
  it('checks the name, then sends the area', async () => {
    mockGet.mockResolvedValue({ data: EMPTY, error: null });
    mockCreateArea.mockResolvedValue({
      data: { ...EMPTY, areas: [WESTLANDS], hasDeliveryOption: true },
      error: null,
    });
    const user = userEvent.setup();
    await render(<AreaScreen />);
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(1));
    await user.press(screen.getByRole('button', { name: 'Add area' }));
    expect(await screen.findByText('Enter the area name, e.g. Westlands.')).toBeTruthy();
    expect(mockCreateArea).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('Area name'), 'Kilimani');
    await user.type(screen.getByLabelText('Delivery fee'), '250');
    await user.press(screen.getByRole('checkbox', { name: 'Bus parcel or courier' }));
    await user.type(screen.getByLabelText('Delivery time'), '1–2 days');
    await fireEvent(screen.getByLabelText('Free delivery over the amount'), 'valueChange', true);
    await user.press(screen.getByRole('button', { name: 'Add area' }));
    expect(mockCreateArea).toHaveBeenCalledWith({
      name: 'Kilimani',
      fee: 250,
      method: 'parcel',
      etaLabel: '1–2 days',
      freeDeliveryEligible: true,
    });
    await waitFor(() => expect(router.back).toHaveBeenCalled());
  });

  it('shows the server’s error and stays on the form', async () => {
    mockGet.mockResolvedValue({ data: EMPTY, error: null });
    mockCreateArea.mockResolvedValue({ data: null, error: { status: 0, code: 'UNREACHABLE' } });
    const user = userEvent.setup();
    await render(<AreaScreen />);
    await user.type(screen.getByLabelText('Area name'), 'Kilimani');
    await user.type(screen.getByLabelText('Delivery fee'), '0');
    await user.press(screen.getByRole('button', { name: 'Add area' }));
    expect(await screen.findByText("Couldn't reach oda. Try again.")).toBeTruthy();
    expect(mockCreateArea).toHaveBeenCalledWith(expect.objectContaining({ fee: 0 }));
    expect(router.back).not.toHaveBeenCalled();
  });
});
