// The seller app's calls for Home (/api/home) and the notifications list (M6 CP3).
import type { OrderSource, PushType } from '@oda/shared';
import { apiJson } from '@/api';

export interface HomeData {
  firstName: string | null;
  hasOrders: boolean;
  unreadNotifications: number;
  /**
   * What stops buyers ordering; empty when the shop takes orders (decision #109 c). Plain
   * strings: an older server may still send "delivery" (decision #110 a), which the banner skips.
   */
  ordering?: { blockers: string[] };
  sales: { thisWeek: number; lastWeek: number; days: number[]; todayIndex: number };
  sources: { ordersThisWeek: number; top: { source: OrderSource; count: number } | null };
}

export interface NotificationItem {
  id: string;
  type: PushType | 'new_review';
  title: string;
  body: string;
  orderId: string | null;
  /** new_review rows (M7): tapping opens the Reviews screen at this review. */
  reviewId?: string | null;
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
