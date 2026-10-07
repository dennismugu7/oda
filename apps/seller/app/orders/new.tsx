// New order (design 17-new-order; spec §5.4): an order the seller takes from a DM, a call or in
// person. Buyer name and WhatsApp number, products from the catalogue (size / colour / qty),
// pickup or a delivery area with an editable fee, and Already paid / Not paid yet / Pay on
// delivery. Prices and the total come from the server's quote; after creating, the order link
// is shown to copy or send on WhatsApp (for "Not paid yet" it's where the buyer pays).
import Feather from '@expo/vector-icons/Feather';
import {
  formatKsh,
  MANUAL_PAYMENT_LABELS,
  MANUAL_PAYMENTS,
  orderLinkMessage,
  waLink,
  type ManualPayment,
} from '@oda/shared';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { catalogueApi, type ProductSummary } from '@/catalogue/api';
import { deliveryApi, type Delivery } from '@/delivery/api';
import { parseShillings } from '@/delivery/form';
import { errorMessage } from '@/onboarding/labels';
import { ordersApi, ordersCache, type ManualQuote, type OrderDetail } from '@/orders/api';
import {
  addLine,
  lineOptions,
  newIdempotencyKey,
  newOrderProblem,
  stepQty,
  type DraftLine,
} from '@/orders/newOrder';
import { Button, Field, FormMessage } from '@/ui/auth';
import { Chip } from '@/ui/onboarding';
import { colors, radii, spacing, text } from '@/theme';

type Choice = { kind: 'pickup' } | { kind: 'delivery'; areaId: string } | null;

export default function NewOrder() {
  const insets = useSafeAreaInsets();
  const [key] = useState(() => newIdempotencyKey());
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState(true);
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [choice, setChoice] = useState<Choice>(null);
  const [address, setAddress] = useState('');
  const [feeText, setFeeText] = useState<string | null>(null); // null = the area's own fee
  const [payment, setPayment] = useState<ManualPayment>('paid');
  const [delivery, setDelivery] = useState<Delivery | null>(null);
  const [products, setProducts] = useState<ProductSummary[] | null>(null);
  const [quote, setQuote] = useState<ManualQuote | null>(null);
  const [deliveryError, setDeliveryError] = useState<string | null>(null);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoteAttempt, setQuoteAttempt] = useState(0);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [created, setCreated] = useState<OrderDetail | null>(null);

  const loadDelivery = useCallback(async () => {
    const { data, error: failed } = await deliveryApi.get();
    if (data) setDelivery(data);
    setDeliveryError(data ? null : errorMessage(failed));
  }, []);

  const loadProducts = useCallback(async () => {
    const { data, error: failed } = await catalogueApi.products();
    if (data) setProducts(data.products);
    setProductsError(data ? null : errorMessage(failed));
  }, []);

  useEffect(() => {
    loadDelivery();
    loadProducts();
  }, [loadDelivery, loadProducts]);

  const override = feeText === null ? undefined : (parseShillings(feeText) ?? undefined);
  const quoteKey = JSON.stringify([
    lines.map((l) => [l.productId, l.qty, l.size, l.colour]),
    override,
  ]);

  // The total, priced by the server (a short pause while the seller is still editing).
  useEffect(() => {
    if (lines.length === 0) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const { data, error: failed } = await ordersApi.quoteManual({
        lines: lines.map((l) => ({
          productId: l.productId,
          qty: l.qty,
          size: l.size,
          colour: l.colour,
        })),
        ...(override !== undefined ? { deliveryFeeOverride: override } : {}),
      });
      if (cancelled) return;
      // No price shown (or Create offered) from an old quote that no longer matches.
      setQuote(data);
      setQuoteError(
        data
          ? null
          : failed?.code === 'OFFLINE'
            ? errorMessage(failed)
            : 'Couldn’t price this order.',
      );
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // quoteKey stands for lines + override.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteKey, quoteAttempt]);
  const unpriced = lines.length > 0 && !!quoteError;

  const option = useMemo(() => {
    if (!quote || !choice || lines.length === 0) return null;
    return (
      quote.options.find((o) =>
        choice.kind === 'pickup' ? o.kind === 'pickup' : o.areaId === choice.areaId,
      ) ?? null
    );
  }, [quote, choice, lines.length]);

  async function create() {
    const fulfilment =
      choice === null
        ? null
        : choice.kind === 'pickup'
          ? { kind: 'pickup' as const }
          : { kind: 'delivery' as const, areaId: choice.areaId, addressText: address };
    const problem = newOrderProblem({ name, phone, lines, fulfilment });
    if (problem) {
      setError(problem);
      return;
    }
    if (feeText !== null && parseShillings(feeText) === null) {
      setFieldErrors({ deliveryFeeOverride: 'Enter the fee in whole shillings.' });
      return;
    }
    setBusy(true);
    setError(null);
    setFieldErrors({});
    const { data, error: failed } = await ordersApi.createManual({
      idempotencyKey: key,
      buyer: { name: name.trim(), phone, whatsapp },
      lines: lines.map((l) => ({
        productId: l.productId,
        qty: l.qty,
        size: l.size,
        colour: l.colour,
      })),
      fulfilment: fulfilment!,
      payment,
      ...(override !== undefined ? { deliveryFeeOverride: override } : {}),
    });
    setBusy(false);
    if (!data) {
      setError(errorMessage(failed));
      setFieldErrors(failed?.fields ?? {});
      return;
    }
    ordersCache.setDetail(data);
    setCreated(data);
  }

  const close = () => (router.canGoBack() ? router.back() : router.replace('/orders'));

  if (created) return <Created order={created} onClose={close} />;

  const areas = delivery?.areas ?? [];
  const itemCount = lines.reduce((n, l) => n + l.qty, 0);

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar style="light" />
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={12}
          onPress={close}
        >
          <Feather name="x" size={28} color={colors.textOnNavy} />
        </Pressable>
        <View style={styles.flex}>
          <Text accessibilityRole="header" style={styles.title}>
            New order
          </Text>
          <Text style={styles.subtitle}>For orders from DMs, calls or in person</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.overline}>BUYER</Text>
          <Field
            label="Buyer’s name"
            value={name}
            onChangeText={setName}
            placeholder="e.g. Njeri Kamau"
            maxLength={60}
            error={fieldErrors['buyer.name']}
          />
          <Field
            label="Buyer’s WhatsApp number"
            value={phone}
            onChangeText={setPhone}
            placeholder="0712 345 678"
            keyboardType="phone-pad"
            maxLength={16}
            error={fieldErrors['buyer.phone']}
          />
          <View style={styles.switchRow}>
            <Text style={styles.switchText}>They use WhatsApp on this number</Text>
            <Switch
              accessibilityLabel="They use WhatsApp on this number"
              value={whatsapp}
              onValueChange={setWhatsapp}
              trackColor={{ true: colors.green, false: colors.toggleOff }}
              thumbColor={colors.surface}
            />
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.overline}>ITEMS</Text>
            {itemCount ? (
              <Text style={styles.count}>
                {itemCount} {itemCount === 1 ? 'item' : 'items'}
              </Text>
            ) : null}
          </View>
          {lines.map((l, i) => (
            <View
              key={`${l.productId}-${l.size}-${l.colour}`}
              style={[styles.line, styles.divider]}
            >
              {l.thumbUrl ? (
                <Image source={{ uri: l.thumbUrl }} style={styles.thumb} />
              ) : (
                <View style={styles.thumb} />
              )}
              <View style={styles.flex}>
                <Text style={styles.lineName} numberOfLines={1}>
                  {l.name}
                </Text>
                <Text style={styles.lineSub}>
                  {[lineOptions(l), formatKsh(l.unitPrice)].filter(Boolean).join(' · ')}
                </Text>
              </View>
              <Stepper
                qty={l.qty}
                name={l.name}
                onMinus={() => setLines((ls) => stepQty(ls, i, -1))}
                onPlus={() => setLines((ls) => stepQty(ls, i, 1))}
              />
            </View>
          ))}
          <Pressable
            accessibilityRole="button"
            onPress={() => setPicking(true)}
            style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
          >
            <Feather name="plus" size={20} color={colors.navy} />
            <Text style={styles.addText}>Add product</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.overline}>DELIVERY</Text>
          {!delivery ? (
            deliveryError ? (
              <>
                <FormMessage>{deliveryError}</FormMessage>
                <Button
                  title="Try again"
                  variant="secondary"
                  onPress={() => {
                    setDeliveryError(null);
                    loadDelivery();
                  }}
                />
              </>
            ) : (
              <ActivityIndicator color={colors.primary} />
            )
          ) : (
            <View style={styles.chips}>
              <Chip
                label="Pickup"
                selected={choice?.kind === 'pickup'}
                onPress={() => setChoice({ kind: 'pickup' })}
              />
              {areas.map((a) => (
                <Chip
                  key={a.id}
                  label={`${a.name} · ${formatKsh(a.fee)}`}
                  selected={choice?.kind === 'delivery' && choice.areaId === a.id}
                  onPress={() => setChoice({ kind: 'delivery', areaId: a.id })}
                />
              ))}
            </View>
          )}
          {choice?.kind === 'delivery' ? (
            <Field
              label="Delivery address"
              value={address}
              onChangeText={setAddress}
              placeholder="Estate, building, landmark"
              maxLength={200}
              error={fieldErrors['fulfilment.addressText']}
            />
          ) : null}
          {choice ? (
            feeText === null ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Change the delivery fee"
                onPress={() => setFeeText(option ? String(option.deliveryFee) : '0')}
                style={styles.feeRow}
              >
                <Text style={styles.feeLabel}>Delivery fee</Text>
                <Text style={styles.feeValue}>
                  {option
                    ? option.deliveryFee === 0
                      ? 'Free'
                      : formatKsh(option.deliveryFee)
                    : '—'}
                </Text>
                <Feather name="edit-2" size={18} color={colors.textSecondary} />
              </Pressable>
            ) : (
              <View style={styles.feeEdit}>
                <View style={styles.flex}>
                  <Field
                    label="Delivery fee"
                    left={<Text style={styles.prefix}>KSh</Text>}
                    value={feeText}
                    onChangeText={setFeeText}
                    keyboardType="number-pad"
                    maxLength={6}
                    error={fieldErrors.deliveryFeeOverride}
                    autoFocus
                  />
                </View>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setFeeText(null)}
                  style={styles.reset}
                >
                  <Text style={styles.resetText}>Use the area’s fee</Text>
                </Pressable>
              </View>
            )
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.overline}>PAYMENT</Text>
          <View style={styles.payments}>
            {MANUAL_PAYMENTS.map((p) => {
              const on = p === payment;
              return (
                <Pressable
                  key={p}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  onPress={() => setPayment(p)}
                  style={[styles.payment, on && styles.paymentOn]}
                >
                  <Text style={styles.paymentText}>{MANUAL_PAYMENT_LABELS[p]}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.hint}>
            {payment === 'not_paid'
              ? 'You’ll get the order link to send the buyer, so they can pay on M-Pesa.'
              : payment === 'paid'
                ? 'The order is ready to send.'
                : 'Collect the money when you deliver.'}
          </Text>
        </View>

        {unpriced ? (
          <>
            <FormMessage>{quoteError}</FormMessage>
            <Button
              title="Try again"
              variant="secondary"
              onPress={() => setQuoteAttempt((n) => n + 1)}
            />
          </>
        ) : null}
        {error ? <FormMessage>{error}</FormMessage> : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <Button
          title={option && !unpriced ? `Create order · ${formatKsh(option.total)}` : 'Create order'}
          onPress={create}
          loading={busy}
          disabled={unpriced}
        />
      </View>

      <ProductPicker
        visible={picking}
        products={products}
        error={productsError}
        onRetry={() => {
          setProductsError(null);
          loadProducts();
        }}
        onClose={() => setPicking(false)}
        onPick={(line) => {
          setLines((ls) => addLine(ls, line));
          setPicking(false);
        }}
      />
    </KeyboardAvoidingView>
  );
}

function Stepper({
  qty,
  name,
  onMinus,
  onPlus,
}: {
  qty: number;
  name: string;
  onMinus: () => void;
  onPlus: () => void;
}) {
  return (
    <View style={styles.stepper}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={qty === 1 ? `Remove ${name}` : `One less ${name}`}
        onPress={onMinus}
        style={styles.stepButton}
      >
        <Feather name={qty === 1 ? 'trash-2' : 'minus'} size={18} color={colors.navy} />
      </Pressable>
      <Text style={styles.qty}>{qty}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`One more ${name}`}
        onPress={onPlus}
        style={styles.stepButton}
      >
        <Feather name="plus" size={18} color={colors.navy} />
      </Pressable>
    </View>
  );
}

/** Pick a product, then its size and colour when it has them. */
function ProductPicker({
  visible,
  products,
  error,
  onRetry,
  onClose,
  onPick,
}: {
  visible: boolean;
  products: ProductSummary[] | null;
  /** Why the products didn't load (they're asked for once, when the screen opens). */
  error: string | null;
  onRetry: () => void;
  onClose: () => void;
  onPick: (line: DraftLine) => void;
}) {
  const insets = useSafeAreaInsets();
  const [product, setProduct] = useState<ProductSummary | null>(null);
  const [size, setSize] = useState<string | null>(null);
  const [colour, setColour] = useState<string | null>(null);

  function reset() {
    setProduct(null);
    setSize(null);
    setColour(null);
  }

  function pick(p: ProductSummary, s: string | null, c: string | null) {
    onPick({
      productId: p.id,
      name: p.name,
      unitPrice: p.price,
      thumbUrl: p.coverUrl,
      size: s,
      colour: c,
      qty: 1,
    });
    reset();
  }

  const ready =
    product && (product.sizes.length === 0 || size) && (product.colours.length === 0 || colour);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={() => {
        reset();
        onClose();
      }}
    >
      <Pressable
        style={styles.backdrop}
        accessibilityRole="button"
        accessibilityLabel="Close"
        onPress={() => {
          reset();
          onClose();
        }}
      />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}>
        <View style={styles.handle} />
        <Text accessibilityRole="header" style={styles.sheetTitle}>
          {product ? product.name : 'Add product'}
        </Text>
        {!products ? (
          error ? (
            <View style={styles.sheetBody}>
              <FormMessage>{error}</FormMessage>
              <Button title="Try again" onPress={onRetry} />
            </View>
          ) : (
            <ActivityIndicator color={colors.primary} />
          )
        ) : product ? (
          <ScrollView contentContainerStyle={styles.sheetBody}>
            {product.sizes.length ? (
              <>
                <Text style={styles.pickLabel}>Size</Text>
                <View style={styles.chips}>
                  {product.sizes.map((s) => (
                    <Chip key={s} label={s} selected={size === s} onPress={() => setSize(s)} />
                  ))}
                </View>
              </>
            ) : null}
            {product.colours.length ? (
              <>
                <Text style={styles.pickLabel}>Colour</Text>
                <View style={styles.chips}>
                  {product.colours.map((c) => (
                    <Chip
                      key={c.name}
                      label={c.name}
                      selected={colour === c.name}
                      onPress={() => setColour(c.name)}
                    />
                  ))}
                </View>
              </>
            ) : null}
            <Button
              title={`Add · ${formatKsh(product.price)}`}
              disabled={!ready}
              onPress={() => pick(product, size, colour)}
            />
            <Button title="Back" variant="secondary" onPress={reset} />
          </ScrollView>
        ) : products.length === 0 ? (
          <Text style={styles.hint}>Add products to your shop first.</Text>
        ) : (
          <ScrollView>
            {products.map((p, i) => (
              <Pressable
                key={p.id}
                accessibilityRole="button"
                accessibilityLabel={`${p.name}, ${formatKsh(p.price)}`}
                onPress={() =>
                  p.sizes.length || p.colours.length ? setProduct(p) : pick(p, null, null)
                }
                style={({ pressed }) => [
                  styles.pickRow,
                  i > 0 && styles.divider,
                  pressed && styles.pressed,
                ]}
              >
                {p.coverUrl ? (
                  <Image source={{ uri: p.coverUrl }} style={styles.thumb} />
                ) : (
                  <View style={styles.thumb} />
                )}
                <View style={styles.flex}>
                  <Text style={styles.lineName} numberOfLines={1}>
                    {p.name}
                  </Text>
                  <Text style={styles.lineSub}>
                    {formatKsh(p.price)}
                    {p.status === 'sold_out'
                      ? ' · Sold out'
                      : p.status === 'hidden'
                        ? ' · Hidden'
                        : ''}
                  </Text>
                </View>
                <Feather name="plus" size={20} color={colors.navy} />
              </Pressable>
            ))}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

/** After "Create order": the order link to copy or send on WhatsApp. */
function Created({ order, onClose }: { order: OrderDetail; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [copied, setCopied] = useState(false);
  const awaitingPayment = order.status === 'awaiting_payment';
  const message = orderLinkMessage({
    buyerName: order.buyer.name,
    number: order.number,
    total: order.total,
    shopName: order.shop.name,
    link: order.link,
    awaitingPayment,
  });
  return (
    <View style={[styles.screen, styles.created, { paddingTop: insets.top + spacing.xl }]}>
      <StatusBar style="dark" />
      <View style={styles.check}>
        <Feather name="check" size={32} color={colors.textOnNavy} />
      </View>
      <Text accessibilityRole="header" style={styles.createdTitle}>
        Order #{order.number} created
      </Text>
      <Text style={styles.createdLine}>
        {awaitingPayment
          ? `Send ${order.buyer.name} the order link. It shows them how to pay you ${formatKsh(order.total)} on M-Pesa.`
          : `Send ${order.buyer.name} the order link so they can follow the order.`}
      </Text>
      <View style={styles.linkBox}>
        <Text style={styles.linkText} selectable numberOfLines={2}>
          {order.link}
        </Text>
      </View>
      <View style={styles.createdButtons}>
        {order.buyer.whatsapp ? (
          <Button
            title="Send on WhatsApp"
            onPress={() => Linking.openURL(waLink(order.buyer.phone, message)).catch(() => {})}
          />
        ) : null}
        <Button
          title={copied ? 'Copied' : 'Copy link'}
          variant="secondary"
          onPress={async () => {
            await Clipboard.setStringAsync(order.link);
            setCopied(true);
          }}
        />
        <Button
          title="View order"
          variant="secondary"
          onPress={() => router.replace({ pathname: '/orders/[id]', params: { id: order.id } })}
        />
        <Pressable accessibilityRole="button" onPress={onClose} style={styles.done}>
          <Text style={styles.doneText}>Done</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.navy,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.lg,
    borderBottomLeftRadius: radii.sheet + 8,
    borderBottomRightRadius: radii.sheet + 8,
  },
  title: { ...text('headline'), color: colors.textOnNavy },
  subtitle: { ...text('body'), color: colors.toggleOff },
  body: { padding: spacing.lg, gap: spacing.md },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  overline: { ...text('overline'), color: colors.textSecondary },
  count: { ...text('bodyStrong'), fontFamily: 'Poppins_700Bold', color: colors.navy },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  switchText: { ...text('body'), color: colors.textSecondary, flex: 1 },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  thumb: { width: 48, height: 48, borderRadius: radii.md, backgroundColor: colors.beige },
  lineName: { ...text('bodyStrong'), fontFamily: 'Poppins_700Bold', color: colors.navy },
  lineSub: { ...text('small'), color: colors.textSecondary },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stepButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qty: {
    ...text('subtitle'),
    fontFamily: 'Poppins_700Bold',
    color: colors.navy,
    minWidth: 18,
    textAlign: 'center',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 52,
    marginTop: spacing.xs,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.toggleOff,
  },
  addText: { ...text('bodyStrong'), fontFamily: 'Poppins_700Bold', color: colors.navy },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  feeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44 },
  feeLabel: { ...text('body'), color: colors.textSecondary, flex: 1 },
  feeValue: { ...text('bodyStrong'), fontFamily: 'Poppins_700Bold', color: colors.navy },
  feeEdit: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  prefix: { ...text('bodyStrong'), color: colors.textSecondary },
  reset: { minHeight: 52, justifyContent: 'center', marginBottom: spacing.md },
  resetText: { ...text('small'), fontFamily: 'Poppins_700Bold', color: colors.primary },
  payments: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  payment: {
    flexGrow: 1,
    minHeight: 52,
    paddingHorizontal: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paymentOn: { borderWidth: 2, borderColor: colors.borderStrong },
  paymentText: { ...text('bodyStrong'), fontFamily: 'Poppins_700Bold', color: colors.navy },
  hint: { ...text('small'), color: colors.textSecondary },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  backdrop: { flex: 1, backgroundColor: 'rgba(28,26,46,0.4)' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    maxHeight: '80%',
    gap: spacing.sm,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.toggleOff,
    marginBottom: spacing.sm,
  },
  sheetTitle: { ...text('title'), color: colors.navy },
  sheetBody: { gap: spacing.md, paddingBottom: spacing.md },
  pickLabel: { ...text('bodyStrong'), fontFamily: 'Poppins_700Bold', color: colors.navy },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 64 },
  created: { paddingHorizontal: spacing.lg, alignItems: 'center', gap: spacing.md },
  check: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.greenBright,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createdTitle: { ...text('headline'), color: colors.navy, textAlign: 'center' },
  createdLine: { ...text('body'), color: colors.textSecondary, textAlign: 'center' },
  linkBox: {
    alignSelf: 'stretch',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  linkText: { ...text('bodyStrong'), color: colors.navy },
  createdButtons: { alignSelf: 'stretch', gap: spacing.sm },
  done: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  doneText: { ...text('button'), color: colors.navy },
  pressed: { opacity: 0.85 },
});
