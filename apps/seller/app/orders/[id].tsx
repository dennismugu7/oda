// Order detail (design 17-order-detail; spec §5.4): the stepper, a card saying where the order
// stands and what to do, the buyer (call, WhatsApp), items and money, delivery, and the action
// for the current state. Actions are whatever the shared machine allows (the server checks
// again); after one with a WhatsApp step, the seller's WhatsApp opens with the message if the
// toggle is on. A lost race ("This order changed") reloads the order.
import Feather from '@expo/vector-icons/Feather';
import {
  BUYER_CANCEL_LABELS,
  firstName,
  formatKePhone,
  formatKsh,
  headerTime,
  primaryAction,
  SELLER_CANCELLED_LABELS,
  shortDate,
  sourceLabel,
  stepperSteps,
  waLink,
  type SellerActionInput,
} from '@oda/shared';
import * as Clipboard from 'expo-clipboard';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { errorMessage } from '@/onboarding/labels';
import { ordersApi, ordersCache, type OrderDetail } from '@/orders/api';
import { Stepper, TextButton } from '@/orders/parts';
import { accountLabel, OrderSheet, type SheetKind } from '@/orders/sheets';
import { Button, FormMessage } from '@/ui/auth';
import { OfflineBar } from '@/ui/offline';
import { Sheet } from '@/ui/sheet';
import { colors, radii, spacing, text } from '@/theme';

const PRIMARY_LABELS: Record<string, string> = {
  confirmPayment: 'Confirm payment',
  accept: 'Accept order',
  markSent: 'Mark as sent',
  markDelivered: 'Mark as delivered',
  markRefundSent: 'Mark refund sent',
};

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const [order, setOrder] = useState<OrderDetail | null>(() => ordersCache.detail(id));
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [sheet, setSheet] = useState<SheetKind | null>(null);
  const [sheetKey, setSheetKey] = useState(0);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState(false);

  const keep = useCallback((value: OrderDetail) => {
    ordersCache.setDetail(value);
    setOrder(value);
  }, []);

  const load = useCallback(async () => {
    const { data, error: failed } = await ordersApi.get(id);
    if (data) {
      keep(data);
      setError(null);
      setOffline(false);
    } else {
      setOffline(failed?.code === 'OFFLINE');
      setError(errorMessage(failed));
    }
  }, [id, keep]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  function open(kind: SheetKind) {
    if (offline) {
      setNotice('You’re offline. Connect to the internet to update this order.');
      return;
    }
    setSheetError(null);
    setSheetKey((k) => k + 1);
    setSheet(kind);
  }

  async function act(action: SellerActionInput, whatsapp: boolean) {
    setBusy(true);
    setSheetError(null);
    setNotice(null);
    const { data, error: failed } = await ordersApi.act(id, action);
    setBusy(false);
    if (!data) {
      setSheetError(errorMessage(failed));
      // Someone else (another phone, the buyer) changed it: show what it is now.
      if (failed?.status === 409 || failed?.code === 'forbidden_transition') load();
      return;
    }
    keep(data.order);
    setSheet(null);
    if (whatsapp && data.whatsapp) {
      const opened = await Linking.openURL(data.whatsapp.url).then(
        () => true,
        () => false,
      );
      if (!opened) setNotice('Saved. We couldn’t open WhatsApp on this phone.');
    }
  }

  async function quickAccept() {
    if (offline) {
      setNotice('You’re offline. Connect to the internet to update this order.');
      return;
    }
    setBusy(true);
    setNotice(null);
    const { data, error: failed } = await ordersApi.act(id, { type: 'accept' });
    setBusy(false);
    if (data) keep(data.order);
    else {
      setNotice(errorMessage(failed));
      load();
    }
  }

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const back = () => (router.canGoBack() ? router.back() : router.replace('/orders'));

  if (!order) {
    return (
      <View style={styles.screen}>
        <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
          <StatusBar style="light" />
          <BackButton onPress={back} />
        </View>
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
      </View>
    );
  }

  const name = firstName(order.buyer.name);
  const via = sourceLabel(order.source);
  const primary = primaryAction(order.actions);
  const can = (a: string) => order.actions.includes(a as never);
  const cancelled = order.status === 'cancelled';

  function onPrimary() {
    if (primary === 'accept') return quickAccept();
    if (primary) open(primary);
  }

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <StatusBar style="light" />
        <View style={styles.headerRow}>
          <BackButton onPress={back} />
          <View style={styles.flex}>
            <Text accessibilityRole="header" style={styles.title}>
              Order #{order.number}
            </Text>
            <Text style={styles.subtitle}>
              {headerTime(new Date(order.placedAt))}
              {via ? ` · ${via}` : ''}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="More actions"
            hitSlop={12}
            onPress={() => setMenu(true)}
          >
            <Feather name="more-vertical" size={26} color={colors.textOnNavy} />
          </Pressable>
        </View>
        {cancelled ? (
          <View style={styles.cancelledPill}>
            <Feather name="x-circle" size={16} color={colors.textOnNavy} />
            <Text style={styles.cancelledText}>Cancelled</Text>
          </View>
        ) : (
          <Stepper steps={stepperSteps(order, order.fulfilment, order.shop.name)} />
        )}
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[colors.primary]} />
        }
      >
        {offline ? <OfflineBar /> : null}
        {error && !offline ? <FormMessage>{error}</FormMessage> : null}
        {notice ? <FormMessage tone="info">{notice}</FormMessage> : null}

        <StatusCard order={order} onResolve={() => open('resolveClaim')} />

        <View style={[styles.card, styles.buyer]}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{order.buyer.name.trim().charAt(0).toUpperCase()}</Text>
          </View>
          <View style={styles.flex}>
            <Text style={styles.buyerName} numberOfLines={1}>
              {order.buyer.name}
            </Text>
            <Text style={styles.buyerLine}>{formatKePhone(order.buyer.phone)}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Call ${name}`}
            onPress={() => Linking.openURL(`tel:${order.buyer.phone}`)}
            style={({ pressed }) => [styles.round, pressed && styles.pressed]}
          >
            <Feather name="phone" size={22} color={colors.navy} />
          </Pressable>
          {order.buyer.whatsapp ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`WhatsApp ${name}`}
              onPress={() =>
                Linking.openURL(
                  waLink(order.buyer.phone, `Hi ${name}, about your order #${order.number}: `),
                )
              }
              style={({ pressed }) => [styles.round, styles.roundGreen, pressed && styles.pressed]}
            >
              <Feather name="message-circle" size={22} color={colors.textOnNavy} />
            </Pressable>
          ) : null}
        </View>

        <View style={styles.card}>
          {order.items.map((item, i) => (
            <View key={item.id} style={[styles.item, i > 0 && styles.divider]}>
              {item.thumbUrl ? (
                <Image source={{ uri: item.thumbUrl }} style={styles.thumb} />
              ) : (
                <View style={[styles.thumb, styles.thumbEmpty]}>
                  <Feather name="shopping-bag" size={18} color={colors.textMuted} />
                </View>
              )}
              <View style={styles.flex}>
                <Text style={styles.itemName}>{item.name}</Text>
                <Text style={styles.itemLine}>
                  {[item.colour, item.size ? `Size ${item.size}` : null, `Qty ${item.qty}`]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
              <Text style={styles.itemPrice}>{formatKsh(item.unitPrice * item.qty)}</Text>
            </View>
          ))}
          <View style={[styles.moneyRow, styles.divider]}>
            <Text style={styles.moneyLabel}>
              {order.fulfilment === 'pickup' ? 'Pickup' : 'Delivery'}
            </Text>
            <Text style={styles.moneyValue}>
              {order.deliveryFee === 0 ? 'Free' : formatKsh(order.deliveryFee)}
            </Text>
          </View>
          <View style={styles.moneyRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>{formatKsh(order.total)}</Text>
          </View>
          <Text style={styles.paysTo}>
            {order.paymentMethod === 'pay_on_delivery'
              ? 'Pay on delivery'
              : order.paymentAccount
                ? `Pays to ${accountLabel(order.paymentAccount)} · ${order.paymentAccount.name}`
                : 'Paid to you directly'}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.overline}>
            {order.fulfilment === 'pickup' ? 'PICKUP' : 'DELIVERY'}
          </Text>
          <Text style={styles.deliveryTitle}>
            {order.fulfilment === 'pickup'
              ? `Pickup${order.shop.pickupLocation ? ` at ${order.shop.pickupLocation}` : ''}`
              : (order.deliveryAreaName ?? 'Delivery')}
          </Text>
          {order.addressText ? <Text style={styles.deliveryLine}>{order.addressText}</Text> : null}
          {order.sentMethod ? (
            <Text style={styles.deliveryLine}>
              {order.sentMethod === 'pickup'
                ? 'Ready for pickup'
                : order.sentMethod === 'parcel'
                  ? 'Sent by parcel service'
                  : `Sent by rider${order.riderPhone ? ` · ${formatKePhone(order.riderPhone)}` : ''}`}
              {order.sentAt ? ` · ${shortDate(new Date(order.sentAt))}` : ''}
            </Text>
          ) : null}
          <Text style={styles.deliveryHint}>
            {order.buyer.hasEmail
              ? `${name} gets email updates when you act on this order.`
              : `${name} follows the order on their order page.`}
          </Text>
        </View>
      </ScrollView>

      {primary || can('markPaid') || can('paymentNotFound') ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
          {primary ? (
            <Button title={PRIMARY_LABELS[primary]!} onPress={onPrimary} loading={busy && !sheet} />
          ) : null}
          {can('markPaid') ? (
            <Button
              title="I got the money (mark as paid)"
              variant="secondary"
              onPress={() => open('markPaid')}
            />
          ) : null}
          {can('paymentNotFound') ? (
            <TextButton
              title="Payment isn’t in my M-Pesa"
              onPress={() => open('paymentNotFound')}
            />
          ) : null}
        </View>
      ) : null}

      <OrderSheet
        key={sheetKey}
        kind={sheet}
        order={order}
        busy={busy}
        error={sheetError}
        onClose={() => setSheet(null)}
        onSubmit={act}
      />
      <Sheet
        visible={menu}
        title={`Order #${order.number}`}
        onClose={() => setMenu(false)}
        options={[
          {
            key: 'copy',
            label: 'Copy order link',
            icon: 'copy',
            onPress: async () => {
              await Clipboard.setStringAsync(order.link);
              setNotice('Order link copied. The buyer can track the order with it.');
            },
          },
          ...(can('sellerCancel')
            ? [
                {
                  key: 'cancel',
                  label: 'Cancel order',
                  icon: 'x-circle' as const,
                  destructive: true,
                  onPress: () => open('sellerCancel'),
                },
              ]
            : []),
        ]}
      />
    </View>
  );
}

/** Where the order stands and what to do next. */
function StatusCard({ order, onResolve }: { order: OrderDetail; onResolve: () => void }) {
  const name = firstName(order.buyer.name);
  const total = formatKsh(order.total);
  const claim = order.claims.at(-1);
  const [copied, setCopied] = useState(false);

  if (order.status === 'cancelled') {
    const reason = order.cancel ? SELLER_CANCELLED_LABELS[order.cancel.reason] : null;
    return (
      <>
        <Card tone="muted" title={`Cancelled${reason ? ` · ${reason}` : ''}`}>
          {order.cancel?.note ? (
            <Text style={styles.cardText}>Your note: {order.cancel.note}</Text>
          ) : null}
          {order.cancel ? (
            <Text style={styles.cardText}>
              {name} sees: “{BUYER_CANCEL_LABELS[order.cancel.reason]}”.
            </Text>
          ) : null}
        </Card>
        {order.paymentStatus === 'claimed' ? (
          <Card tone="warning" title={`Did ${name}’s ${total} reach you?`}>
            <Text style={styles.cardTextWarn}>
              {name} said they paid{order.mpesaCode ? ` (code ${order.mpesaCode})` : ''}, then
              cancelled. Check your M-Pesa messages.
            </Text>
            <Button title="Answer" onPress={onResolve} />
          </Card>
        ) : null}
        {order.paymentStatus === 'refund_due' ? (
          <Card tone="warning" title={`Send ${total} back to ${formatKePhone(order.buyer.phone)}`}>
            <Text style={styles.cardTextWarn}>
              Refund {name} on M-Pesa, then tap Mark refund sent below.
            </Text>
          </Card>
        ) : null}
        {order.paymentStatus === 'refunded' ? (
          <Card tone="success" title="Refund sent">
            <Text style={styles.cardText}>
              You sent {total} back to {name}
              {order.refundedAt ? ` on ${shortDate(new Date(order.refundedAt))}` : ''}.
            </Text>
          </Card>
        ) : null}
      </>
    );
  }

  switch (order.status) {
    case 'payment_claimed':
      return (
        <Card tone="warning" title={`${name} says they paid ${total}`}>
          <Text style={styles.cardTextWarn}>
            Find this code in your M-Pesa messages before you confirm.
          </Text>
          <View style={styles.codeBox}>
            <View style={styles.flex}>
              <Text style={styles.codeLabel}>M-Pesa code</Text>
              <Text style={styles.code} selectable>
                {order.mpesaCode}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Copy the M-Pesa code"
              onPress={async () => {
                await Clipboard.setStringAsync(order.mpesaCode ?? '');
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              style={({ pressed }) => [styles.copy, pressed && styles.pressed]}
            >
              <Feather name={copied ? 'check' : 'copy'} size={18} color={colors.navy} />
              <Text style={styles.copyText}>{copied ? 'Copied' : 'Copy'}</Text>
            </Pressable>
          </View>
          {claim?.duplicateOfOrderNumber ? (
            <Text style={styles.duplicate}>
              ⚠ This code was used on order #{claim.duplicateOfOrderNumber}.
            </Text>
          ) : null}
        </Card>
      );
    case 'awaiting_payment': {
      const notFound = claim?.outcome === 'not_found';
      return (
        <Card tone="muted" title={`Waiting for ${name} to pay ${total}`}>
          <Text style={styles.cardText}>
            {notFound
              ? `You said the last code wasn’t in your M-Pesa. ${name} can send it again.`
              : order.source === 'manual'
                ? `Send ${name} the order link (⋮ → Copy order link) so they can pay.`
                : `${name} pays you on M-Pesa and sends the code here. Unpaid orders expire after 48 hours.`}
          </Text>
        </Card>
      );
    }
    case 'awaiting_acceptance':
      return (
        <Card tone="warning" title="New order · pay on delivery">
          <Text style={styles.cardTextWarn}>
            {name} pays {total} when it arrives. Accept it if you can deliver.
          </Text>
        </Card>
      );
    case 'confirmed':
      return order.paymentStatus === 'paid' ? (
        <Card tone="success" title={`Paid · ${total} confirmed`}>
          <Text style={styles.cardTextSuccess}>
            Pack the order and mark it as sent when it leaves.
          </Text>
        </Card>
      ) : (
        <Card tone="success" title={`Accepted · ${name} pays ${total} on delivery`}>
          <Text style={styles.cardTextSuccess}>
            Pack the order and mark it as sent when it leaves.
          </Text>
        </Card>
      );
    case 'sent':
      return (
        <Card
          tone="success"
          title={order.sentMethod === 'pickup' ? 'Ready for pickup' : 'On its way'}
        >
          <Text style={styles.cardTextSuccess}>
            {order.paymentMethod === 'pay_on_delivery' && order.paymentStatus === 'unpaid'
              ? `Collect ${total} from ${name}, then mark it as delivered.`
              : `Mark it as delivered once ${name} has it.`}
          </Text>
        </Card>
      );
    case 'delivered':
      return (
        <Card tone="success" title="Delivered">
          <Text style={styles.cardTextSuccess}>
            {order.deliveredAt ? `${shortDate(new Date(order.deliveredAt))} · ` : ''}
            {total} {order.paymentMethod === 'pay_on_delivery' ? 'collected' : 'paid'}.
          </Text>
        </Card>
      );
  }
  return null;
}

function Card({
  tone,
  title,
  children,
}: {
  tone: 'warning' | 'success' | 'muted';
  title: string;
  children?: ReactNode;
}) {
  return (
    <View
      style={[
        styles.status,
        tone === 'warning' && styles.statusWarning,
        tone === 'success' && styles.statusSuccess,
      ]}
    >
      <Text
        style={[
          styles.statusTitle,
          tone === 'warning' && styles.statusTitleWarning,
          tone === 'success' && styles.statusTitleSuccess,
        ]}
      >
        {title}
      </Text>
      {children}
    </View>
  );
}

function BackButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Back" hitSlop={12} onPress={onPress}>
      <Feather name="chevron-left" size={30} color={colors.textOnNavy} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  header: {
    backgroundColor: colors.navy,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.lg,
    borderBottomLeftRadius: radii.sheet + 8,
    borderBottomRightRadius: radii.sheet + 8,
    gap: spacing.lg,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { ...text('headline'), color: colors.textOnNavy },
  subtitle: { ...text('body'), color: colors.toggleOff },
  cancelledPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'flex-start',
    marginLeft: spacing.xl,
    backgroundColor: colors.navyRaised,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  cancelledText: { ...text('bodyStrong'), color: colors.textOnNavy },
  body: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl },
  loading: { marginTop: spacing.xxl },
  status: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.xl,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  statusWarning: { backgroundColor: colors.warningTint },
  statusSuccess: { backgroundColor: colors.greenTint },
  statusTitle: { ...text('subtitle'), fontFamily: 'Poppins_700Bold', color: colors.navy },
  statusTitleWarning: { color: colors.warningTextStrong },
  statusTitleSuccess: { color: colors.green },
  cardText: { ...text('body'), color: colors.textSecondary },
  cardTextWarn: { ...text('body'), color: colors.warningTextStrong },
  cardTextSuccess: { ...text('body'), color: colors.green },
  codeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.md,
  },
  codeLabel: { ...text('small'), color: colors.textSecondary },
  code: { ...text('title'), letterSpacing: 1, color: colors.navy },
  copy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    minHeight: 44,
  },
  copyText: { ...text('bodyStrong'), fontFamily: 'Poppins_700Bold', color: colors.navy },
  duplicate: { ...text('bodyStrong'), color: colors.danger },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  buyer: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.peach,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { ...text('title'), color: colors.primary },
  buyerName: { ...text('subtitle'), fontFamily: 'Poppins_700Bold', color: colors.navy },
  buyerLine: { ...text('body'), color: colors.textSecondary },
  round: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundGreen: { backgroundColor: colors.green, borderColor: colors.green },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  thumb: { width: 48, height: 48, borderRadius: radii.md, backgroundColor: colors.beige },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  itemName: { ...text('bodyStrong'), fontFamily: 'Poppins_700Bold', color: colors.navy },
  itemLine: { ...text('small'), color: colors.textSecondary },
  itemPrice: { ...text('bodyStrong'), fontFamily: 'Poppins_700Bold', color: colors.navy },
  moneyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  moneyLabel: { ...text('body'), color: colors.textSecondary },
  moneyValue: { ...text('body'), color: colors.navy },
  totalLabel: { ...text('title'), color: colors.navy },
  totalValue: { ...text('title'), color: colors.navy },
  paysTo: { ...text('small'), color: colors.textSecondary },
  overline: { ...text('overline'), color: colors.textSecondary, marginBottom: spacing.xs },
  deliveryTitle: { ...text('bodyStrong'), fontFamily: 'Poppins_700Bold', color: colors.navy },
  deliveryLine: { ...text('body'), color: colors.textSecondary },
  deliveryHint: { ...text('small'), color: colors.textSecondary, marginTop: spacing.sm },
  footer: {
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  pressed: { opacity: 0.85 },
});
