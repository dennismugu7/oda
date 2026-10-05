// The seller app's calls to /api/delivery (20b-delivery, M6 CP1). Every write answers with
// the whole delivery view.
import type { DeliveryMethod } from '@oda/shared';
import { apiJson } from '@/api';

export interface DeliveryArea {
  id: string;
  name: string;
  fee: number;
  method: DeliveryMethod;
  etaLabel: string | null;
  freeDeliveryEligible: boolean;
  position: number;
}

export interface Delivery {
  areas: DeliveryArea[];
  pickupEnabled: boolean;
  pickupLocation: string | null;
  pickupHours: string | null;
  freeDeliveryThreshold: number | null;
  /** An area or pickup: the shop can take orders. */
  hasDeliveryOption: boolean;
}

export interface AreaFields {
  name: string;
  fee: number;
  method: DeliveryMethod;
  etaLabel: string | null;
  freeDeliveryEligible: boolean;
}

export interface DeliverySettings {
  pickupEnabled?: boolean;
  pickupLocation?: string | null;
  pickupHours?: string | null;
  freeDeliveryThreshold?: number | null;
}

export const deliveryApi = {
  get: () => apiJson<Delivery>('/api/delivery'),
  settings: (body: DeliverySettings) => apiJson<Delivery>('/api/delivery', { method: 'PUT', body }),
  createArea: (body: AreaFields) => apiJson<Delivery>('/api/delivery/areas', { body }),
  updateArea: (id: string, body: Partial<AreaFields>) =>
    apiJson<Delivery>(`/api/delivery/areas/${id}`, { method: 'PATCH', body }),
  deleteArea: (id: string) => apiJson<Delivery>(`/api/delivery/areas/${id}`, { method: 'DELETE' }),
  reorder: (ids: string[]) =>
    apiJson<Delivery>('/api/delivery/areas/order', { method: 'PUT', body: { ids } }),
};

/** The last view loaded, so the area screen opens without loading again. */
let cached: Delivery | null = null;
export const deliveryCache = {
  get: () => cached,
  set: (value: Delivery | null) => {
    cached = value;
  },
};
