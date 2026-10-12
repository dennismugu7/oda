// The seller app's calls to /api/orders (M6 CP2). Every action goes to one endpoint and
// answers with the fresh order plus the WhatsApp prefill when the action has one.
import type {
  Fulfilment,
  CancelReason,
  ManualOrderInput,
  OrderSource,
  OrderStatus,
  OrderTab,
  PaymentMethod,
  PaymentStatus,
  SellerActionInput,
  SellerActionType,
  SentMethod,
  SellerTodoGroup,
} from '@oda/shared';
import { apiJson } from '@/api';

export interface OrderRow {
  id: string;
  number: number;
  buyerName: string;
  total: number;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  source: OrderSource;
  placedAt: string;
  todoGroup: SellerTodoGroup | null;
  itemNames: string[];
  thumbUrl: string | null;
}

export type TodoCounts = Record<SellerTodoGroup, number> & { total: number };

export interface OrderList {
  orders: OrderRow[];
  next: string | null;
  todoCounts: TodoCounts;
}

export interface OrderDetail {
  id: string;
  number: number;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  source: OrderSource;
  placedAt: string;
  claimedAt: string | null;
  confirmedAt: string | null;
  paidAt: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  refundedAt: string | null;
  buyer: { name: string; phone: string; whatsapp: boolean; hasEmail: boolean };
  fulfilment: Fulfilment;
  deliveryAreaName: string | null;
  addressText: string | null;
  sentMethod: SentMethod | null;
  riderPhone: string | null;
  subtotal: number;
  deliveryFee: number;
  total: number;
  paymentAccount: {
    type: 'till' | 'pochi' | 'paybill';
    number: string;
    name: string;
    accountRef: string | null;
  } | null;
  mpesaCode: string | null;
  cancel: { reason: CancelReason; note: string | null; by: 'buyer' | 'seller' | 'system' } | null;
  actions: SellerActionType[];
  shop: { name: string; pickupLocation: string | null; pickupHours: string | null };
  items: {
    id: string;
    name: string;
    size: string | null;
    colour: string | null;
    qty: number;
    unitPrice: number;
    thumbUrl: string | null;
  }[];
  claims: {
    id: string;
    code: string;
    outcome: 'pending' | 'confirmed' | 'not_found';
    createdAt: string;
    duplicateOfOrderNumber: number | null;
  }[];
  link: string;
}

export interface ActionResult {
  order: OrderDetail;
  whatsapp: { url: string; text: string } | null;
}

export const ordersApi = {
  list: (tab: OrderTab, opts: { q?: string; cursor?: string | null } = {}) => {
    const params = new URLSearchParams({ tab });
    if (opts.q) params.set('q', opts.q);
    if (opts.cursor) params.set('cursor', opts.cursor);
    return apiJson<OrderList>(`/api/orders?${params}`);
  },
  get: (id: string) => apiJson<OrderDetail>(`/api/orders/${id}`),
  act: (id: string, action: SellerActionInput) =>
    apiJson<ActionResult>(`/api/orders/${id}/actions`, { body: action }),
  quoteManual: (body: Pick<ManualOrderInput, 'lines' | 'deliveryFeeOverride'>) =>
    apiJson<ManualQuote>('/api/orders/quote', { body }),
  createManual: (body: ManualOrderInput) => apiJson<OrderDetail>('/api/orders', { body }),
};

export interface ManualQuote {
  subtotal: number;
  options: {
    kind: Fulfilment;
    areaId: string | null;
    name: string;
    deliveryFee: number;
    total: number;
    freeDeliveryApplied: boolean;
  }[];
}

// What was last loaded, so a screen opens at once and can show saved data offline (spec §8:
// read-only, nothing queued).
const lists = new Map<OrderTab, OrderList>();
const details = new Map<string, OrderDetail>();
export const ordersCache = {
  list: (tab: OrderTab) => lists.get(tab) ?? null,
  setList: (tab: OrderTab, value: OrderList) => lists.set(tab, value),
  detail: (id: string) => details.get(id) ?? null,
  setDetail: (value: OrderDetail) => details.set(value.id, value),
  clear: () => {
    lists.clear();
    details.clear();
  },
};
