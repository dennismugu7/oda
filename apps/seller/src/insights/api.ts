// The seller app's calls for M8b: the More tab (/api/more), Insights (/api/insights),
// Customers (/api/customers) and Help's support contact (/api/support, decision #77).
import type { CustomerFilter, InsightPeriod, OrderSource, PaymentAccountType } from '@oda/shared';
import { apiJson } from '@/api';
import type { ShareData } from '@/share/plan';

export interface MoreData {
  shop: { name: string; slug: string; url: string; linkPrefix: string; logoUrl: string | null };
  salesThisWeek: number;
  customers: number;
  rating: { avg: number | null; count: number };
  activeAccount: { type: PaymentAccountType; number: string } | null;
  acceptsPayOnDelivery: boolean;
  deliveryAreas: number;
  pickupEnabled: boolean;
  categories: number;
}

export interface Insights {
  period: InsightPeriod;
  sales: {
    total: number;
    previous: number;
    change: { text: string; up: boolean } | null;
    bars: number[];
    labels: string[];
    current: number;
  };
  orders: number;
  averageOrder: number;
  visits: number;
  sources: { source: OrderSource; label: string; orders: number }[];
  topProducts: { productId: string | null; name: string; sold: number; thumbUrl: string | null }[];
}

export interface Customer {
  phone: string;
  name: string;
  totalSpent: number;
  orderCount: number;
  lastOrderAt: string;
  repeat: boolean;
}

export interface CustomersPage {
  counts: Record<CustomerFilter, number>;
  customers: Customer[];
  nextCursor: number | null;
}

export interface Support {
  email: string;
  whatsapp: string | null;
}

export const growApi = {
  more: () => apiJson<MoreData>('/api/more'),
  insights: (period: InsightPeriod) => apiJson<Insights>(`/api/insights?period=${period}`),
  customers: (q: { filter: CustomerFilter; q?: string; cursor?: number }) =>
    apiJson<CustomersPage>(
      `/api/customers?${new URLSearchParams({
        filter: q.filter,
        cursor: String(q.cursor ?? 0),
        ...(q.q?.trim() ? { q: q.q.trim() } : {}),
      })}`,
    ),
  support: () => apiJson<Support>('/api/support'),
  share: () => apiJson<ShareData>('/api/share'),
};
