// The seller app's calls for Home (/api/home) and the notifications list (M6 CP3).
import type { OrderSource, PushType } from '@oda/shared';
import { apiJson } from '@/api';

export interface HomeData {
  firstName: string | null;
  hasOrders: boolean;
  unreadNotifications: number;
  sales: { thisWeek: number; lastWeek: number; days: number[]; todayIndex: number };
  sources: { ordersThisWeek: number; top: { source: OrderSource; count: number } | null };
}

export interface NotificationItem {
  id: string;
  type: PushType | 'new_review';
  title: string;
  body: string;
  orderId: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationList {
  notifications: NotificationItem[];
  unread: number;
}

export const homeApi = {
  get: () => apiJson<HomeData>('/api/home'),
  notifications: () => apiJson<NotificationList>('/api/notifications'),
  markRead: (ids?: string[]) =>
    apiJson<NotificationList>('/api/notifications/read', {
      method: 'PATCH',
      body: ids ? { ids } : {},
    }),
};

let cachedHome: HomeData | null = null;
export const homeCache = {
  get: () => cachedHome,
  set: (value: HomeData | null) => {
    cachedHome = value;
  },
};

let cachedNotifications: NotificationList | null = null;
export const notificationsCache = {
  get: () => cachedNotifications,
  set: (value: NotificationList | null) => {
    cachedNotifications = value;
  },
};
