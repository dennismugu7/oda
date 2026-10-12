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
  it('shows only the loading state, then warns that buyers can’t order without an option', async () => {
    let answer: (value: { data: Delivery; error: null }) => void = () => {};
    mockGet.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const user = userEvent.setup();
    await render(<DeliveryScreen />);
    expect(screen.queryByText('DELIVERY AREAS')).toBeNull();
    answer({ data: EMPTY, error: null });
    expect(
      await screen.findByText('Buyers can’t order yet. Add a delivery area or turn on pickup.'),
    ).toBeTruthy();
    expect(
      screen.getByText(
        'No delivery areas yet. Add the places you deliver to and what each one costs.',
      ),
    ).toBeTruthy();
    await user.press(screen.getByRole('button', { name: /Add delivery area/ }));
    expect(router.push).toHaveBeenCalledWith('/delivery/area');
  });

  it('lists the areas without the warning', async () => {
    mockGet.mockResolvedValue({
      data: { ...EMPTY, areas: [WESTLANDS], hasDeliveryOption: true },
      error: null,
    });
    const user = userEvent.setup();
    await render(<DeliveryScreen />);
    const row = await screen.findByRole('button', {
      name: 'Westlands, By rider, KSh 200, Same day',
    });
    expect(screen.queryByText(/Buyers can’t order yet/)).toBeNull();
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
    await waitFor(() => expect(screen.queryByText(/Buyers can’t order yet/)).toBeNull());
    expect(screen.queryByLabelText('Where buyers pick up')).toBeNull();
  });

  it('turning off the only option asks first, in oda’s sheet (decision #109 a)', async () => {
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
    await fireEvent(await screen.findByLabelText('Buyers can pick up'), 'valueChange', false);
    expect(screen.getByRole('header', { name: 'Stop taking orders?' })).toBeTruthy();
    expect(screen.getByText(/buyers can’t order/)).toBeTruthy();
    expect(mockSettings).not.toHaveBeenCalled();
    // Cancel keeps pickup on; Continue turns it off.
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('header', { name: 'Stop taking orders?' })).toBeNull();
    expect(mockSettings).not.toHaveBeenCalled();
    await fireEvent(screen.getByLabelText('Buyers can pick up'), 'valueChange', false);
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(mockSettings).toHaveBeenCalledWith({ pickupEnabled: false }));
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
