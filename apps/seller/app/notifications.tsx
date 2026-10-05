// Notifications (design-changes NEW: notifications list): newest first, an unread dot, tap →
// the order (marked read), "Mark all read". The same events reach the phone as push in CP4.
import Feather from '@expo/vector-icons/Feather';
import { listTime } from '@oda/shared';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState, type ComponentProps } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  homeApi,
  notificationsCache,
  type NotificationItem,
  type NotificationList,
} from '@/home/api';
import { errorMessage } from '@/onboarding/labels';
import { Button, FormMessage } from '@/ui/auth';
import { OfflineBar } from '@/ui/offline';
import { ScreenHeader } from '@/ui/screenHeader';
import { colors, radii, spacing, text } from '@/theme';

const ICONS: Record<NotificationItem['type'], ComponentProps<typeof Feather>['name']> = {
  new_order: 'shopping-bag',
  payment_claimed: 'dollar-sign',
  switched_to_pod: 'truck',
  buyer_cancelled: 'x-circle',
  order_expired: 'clock',
  new_review: 'star',
};

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const [list, setList] = useState<NotificationList | null>(notificationsCache.get());
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(() => new Date());

  const keep = (value: NotificationList) => {
    notificationsCache.set(value);
    setList(value);
  };

  const load = useCallback(async () => {
    const { data, error: failed } = await homeApi.notifications();
    setNow(new Date());
    if (data) {
      keep(data);
      setError(null);
      setOffline(false);
    } else {
      setOffline(failed?.code === 'OFFLINE');
      setError(errorMessage(failed));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function open(n: NotificationItem) {
    if (!n.readAt) {
      // Show it read at once; the server call is best effort.
      setList((l) =>
        l
          ? {
              unread: Math.max(0, l.unread - 1),
              notifications: l.notifications.map((x) =>
                x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x,
              ),
            }
          : l,
      );
      homeApi.markRead([n.id]).then(({ data }) => data && keep(data));
    }
    if (n.orderId) router.push({ pathname: '/orders/[id]', params: { id: n.orderId } });
  }

  async function markAll() {
    const { data, error: failed } = await homeApi.markRead();
    if (data) keep(data);
    else setError(errorMessage(failed));
  }

  const back = () => (router.canGoBack() ? router.back() : router.replace('/home'));

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="Notifications"
        subtitle={list ? (list.unread ? `${list.unread} unread` : 'All caught up') : null}
        link={list?.unread ? { label: 'Mark all read', onPress: markAll } : null}
        onBack={back}
      />
      {!list ? (
        <View style={styles.body}>
          {error ? (
            <>
              {offline ? <OfflineBar /> : <FormMessage>{error}</FormMessage>}
              <Button title="Try again" onPress={load} />
            </>
          ) : (
            <ActivityIndicator style={styles.loading} color={colors.primary} />
          )}
        </View>
      ) : (
        <FlatList
          data={list.notifications}
          keyExtractor={(n) => n.id}
          contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl }]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true);
                await load();
                setRefreshing(false);
              }}
              colors={[colors.primary]}
            />
          }
          ListHeaderComponent={
            offline ? <OfflineBar /> : error ? <FormMessage>{error}</FormMessage> : null
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="bell" size={28} color={colors.primary} />
              <Text style={styles.emptyTitle}>No notifications yet</Text>
              <Text style={styles.emptyLine}>
                New orders, payments and cancellations will show here.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${item.readAt ? '' : 'Unread. '}${item.title}. ${item.body}`}
              onPress={() => open(item)}
              style={({ pressed }) => [
                styles.row,
                !item.readAt && styles.rowUnread,
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.icon}>
                <Feather name={ICONS[item.type]} size={20} color={colors.navy} />
              </View>
              <View style={styles.flex}>
                <Text style={[styles.title, !item.readAt && styles.titleUnread]}>{item.title}</Text>
                <Text style={styles.line}>{item.body}</Text>
                <Text style={styles.time}>{listTime(new Date(item.createdAt), now)}</Text>
              </View>
              {!item.readAt ? <View style={styles.dot} /> : null}
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  body: { padding: spacing.lg, gap: spacing.sm },
  loading: { marginTop: spacing.xxl },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  rowUnread: { borderColor: colors.primarySoft },
  icon: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { ...text('bodyStrong'), color: colors.navy },
  titleUnread: { fontFamily: 'Poppins_700Bold' },
  line: { ...text('body'), color: colors.textSecondary },
  time: { ...text('small'), color: colors.textSecondary, marginTop: 2 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary, marginTop: 6 },
  empty: { alignItems: 'center', gap: spacing.sm, paddingTop: spacing.xxl },
  emptyTitle: { ...text('title'), color: colors.navy },
  emptyLine: { ...text('body'), color: colors.textSecondary, textAlign: 'center' },
  pressed: { opacity: 0.85 },
});
