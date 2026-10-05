// The order actions' sheets (17b-confirm-payment, 17b-cancel-order, 17b-mark-sent, and the new
// mark-delivered sheet; design-changes). Each collects what its action needs and hands it to
// the detail screen, which sends it to the one actions endpoint and then, if the toggle is on,
// opens the seller's WhatsApp with the message the server wrote.
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {
  firstName,
  formatKePhone,
  formatKsh,
  SELLER_CANCEL_LABELS,
  SELLER_CANCEL_REASONS,
  type SellerActionInput,
  type SellerCancelReason,
  type SentMethod,
} from '@oda/shared';
import { useState, type ComponentProps, type ReactElement, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, Field, FormMessage } from '@/ui/auth';
import { Chip } from '@/ui/onboarding';
import { colors, radii, spacing, text } from '@/theme';
import type { OrderDetail } from './api';
import { ActionSheet, CheckBox, Summary, TextButton, WhatsAppToggle } from './parts';

export type SheetKind =
  | 'confirmPayment'
  | 'paymentNotFound'
  | 'markPaid'
  | 'markSent'
  | 'markDelivered'
  | 'sellerCancel'
  | 'markRefundSent'
  | 'resolveClaim';

export interface SheetProps {
  order: OrderDetail;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (action: SellerActionInput, whatsapp: boolean) => void;
}

/** "Till 123 456" / "Pochi 0712 345 678" / "Paybill 247 247 · Acc 1042". */
export function accountLabel(a: OrderDetail['paymentAccount']): string | null {
  if (!a) return null;
  const spaced = a.number.replace(/^(\d{3})(\d+)$/, '$1 $2');
  if (a.type === 'pochi') return `Pochi ${formatKePhone(a.number)}`;
  if (a.type === 'paybill')
    return `Paybill ${spaced}${a.accountRef ? ` · Acc ${a.accountRef}` : ''}`;
  return `Till ${spaced}`;
}

function useWhatsApp(order: OrderDetail) {
  return useState(order.buyer.whatsapp);
}

function ConfirmPayment({ order, busy, error, onClose, onSubmit }: SheetProps) {
  const [checked, setChecked] = useState(false);
  const [wa, setWa] = useWhatsApp(order);
  const name = firstName(order.buyer.name);
  const claim = order.claims.at(-1);
  return (
    <ActionSheet
      visible
      title="Confirm payment?"
      subtitle="Only confirm once you see it in your M-Pesa messages."
      onClose={onClose}
    >
      <Summary
        rows={[
          ['Amount', formatKsh(order.total), true],
          ['From', order.buyer.name],
          ['M-Pesa code', order.mpesaCode ?? '—'],
          ...(accountLabel(order.paymentAccount)
            ? ([['To', accountLabel(order.paymentAccount)!]] as [string, string][])
            : []),
        ]}
      />
      {claim?.duplicateOfOrderNumber ? (
        <Warning>This code was already used on order #{claim.duplicateOfOrderNumber}.</Warning>
      ) : null}
      <CheckBox
        label="The amount and code match my M-Pesa message"
        checked={checked}
        onChange={setChecked}
      />
      <WhatsAppToggle
        name={name}
        line={`${name} gets a message that the payment is confirmed.`}
        value={wa}
        onChange={setWa}
      />
      {error ? <FormMessage>{error}</FormMessage> : null}
      <Button
        title="Confirm payment"
        disabled={!checked}
        loading={busy}
        onPress={() => onSubmit({ type: 'confirmPayment' }, wa)}
      />
      <TextButton title="Not yet" onPress={onClose} />
    </ActionSheet>
  );
}

function PaymentNotFound({ order, busy, error, onClose, onSubmit }: SheetProps) {
  const [wa, setWa] = useWhatsApp(order);
  const name = firstName(order.buyer.name);
  return (
    <ActionSheet
      visible
      title="Payment isn’t in your M-Pesa?"
      subtitle={`The order goes back to waiting for payment. ${name}’s page says you couldn’t find it, and they can send the code again.`}
      onClose={onClose}
    >
      <Summary
        rows={[
          ['Amount', formatKsh(order.total), true],
          ['M-Pesa code', order.mpesaCode ?? '—'],
        ]}
      />
      <WhatsAppToggle
        name={name}
        line={`${name} gets a message asking them to check the code.`}
        value={wa}
        onChange={setWa}
      />
      {error ? <FormMessage>{error}</FormMessage> : null}
      <Button
        title="I can’t find this payment"
        loading={busy}
        onPress={() => onSubmit({ type: 'paymentNotFound' }, wa)}
      />
      <TextButton title="Not yet" onPress={onClose} />
    </ActionSheet>
  );
}

function MarkPaid({ order, busy, error, onClose, onSubmit }: SheetProps) {
  return (
    <ActionSheet
      visible
      title="Mark as paid?"
      subtitle={`Only if ${formatKsh(order.total)} from ${order.buyer.name} is in your M-Pesa.`}
      onClose={onClose}
    >
      <Summary
        rows={[
          ['Amount', formatKsh(order.total), true],
          ['From', order.buyer.name],
          ...(accountLabel(order.paymentAccount)
            ? ([['To', accountLabel(order.paymentAccount)!]] as [string, string][])
            : []),
        ]}
      />
      {error ? <FormMessage>{error}</FormMessage> : null}
      <Button
        title="Mark as paid"
        loading={busy}
        onPress={() => onSubmit({ type: 'markPaid' }, false)}
      />
      <TextButton title="Not yet" onPress={onClose} />
    </ActionSheet>
  );
}

const SENT_OPTIONS: {
  method: SentMethod;
  title: string;
  line: string;
  icon: ComponentProps<typeof MaterialCommunityIcons>['name'];
}[] = [
  { method: 'rider', title: 'Rider', line: 'Boda boda or delivery rider', icon: 'bike' },
  {
    method: 'parcel',
    title: 'Parcel service',
    line: 'Bus parcel or courier',
    icon: 'package-variant-closed',
  },
  {
    method: 'pickup',
    title: 'Buyer picks up',
    line: 'From your shop or stall',
    icon: 'storefront-outline',
  },
];

function MarkSent({ order, busy, error, onClose, onSubmit }: SheetProps) {
  const [method, setMethod] = useState<SentMethod>(
    order.fulfilment === 'pickup' ? 'pickup' : 'rider',
  );
  const [phone, setPhone] = useState('');
  const [wa, setWa] = useWhatsApp(order);
  const name = firstName(order.buyer.name);
  const where =
    order.fulfilment === 'pickup' ? 'for pickup' : `to ${order.deliveryAreaName ?? 'the buyer'}`;
  const count = order.items.reduce((n, i) => n + i.qty, 0);
  return (
    <ActionSheet
      visible
      title={method === 'pickup' ? 'Ready for pickup' : 'Mark as sent'}
      subtitle={`Order #${order.number} · ${count} ${count === 1 ? 'item' : 'items'} ${where}`}
      onClose={onClose}
    >
      <Text style={styles.label}>How is it going?</Text>
      {SENT_OPTIONS.map((o) => {
        const on = o.method === method;
        return (
          <Pressable
            key={o.method}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            onPress={() => setMethod(o.method)}
            style={[styles.option, on && styles.optionOn]}
          >
            <View style={styles.optionIcon}>
              <MaterialCommunityIcons name={o.icon} size={22} color={colors.navy} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.optionTitle}>{o.title}</Text>
              <Text style={styles.optionLine}>{o.line}</Text>
            </View>
            <View style={[styles.radio, on && styles.radioOn]}>
              {on ? <View style={styles.radioDot} /> : null}
            </View>
          </Pressable>
        );
      })}
      {method === 'rider' ? (
        <Field
          label="Rider’s phone number"
          labelHint="Optional"
          value={phone}
          onChangeText={setPhone}
          placeholder={`So ${name} can call the rider`}
          keyboardType="phone-pad"
          maxLength={16}
        />
      ) : null}
      <WhatsAppToggle
        name={name}
        line={
          method === 'pickup'
            ? `${name} gets your pickup place and the order link.`
            : method === 'rider'
              ? `${name} gets the rider’s number and the order link.`
              : `${name} gets a message with the order link.`
        }
        value={wa}
        onChange={setWa}
      />
      {error ? <FormMessage>{error}</FormMessage> : null}
      <Button
        title={method === 'pickup' ? 'Mark ready for pickup' : 'Mark as sent'}
        loading={busy}
        onPress={() =>
          onSubmit(
            {
              type: 'markSent',
              sentMethod: method,
              riderPhone: method === 'rider' && phone.trim() ? phone.trim() : null,
            },
            wa,
          )
        }
      />
    </ActionSheet>
  );
}

function MarkDelivered({ order, busy, error, onClose, onSubmit }: SheetProps) {
  const collect = order.paymentMethod === 'pay_on_delivery' && order.paymentStatus === 'unpaid';
  const [collected, setCollected] = useState(false);
  const [wa, setWa] = useWhatsApp(order);
  const name = firstName(order.buyer.name);
  return (
    <ActionSheet
      visible
      title="Delivered?"
      subtitle={`Order #${order.number} · ${order.buyer.name}`}
      onClose={onClose}
    >
      {collect ? (
        <CheckBox
          label={`I’ve collected ${formatKsh(order.total)}`}
          checked={collected}
          onChange={setCollected}
        />
      ) : null}
      <WhatsAppToggle
        name={name}
        line={`${name} gets a thank-you with the order link.`}
        value={wa}
        onChange={setWa}
      />
      {error ? <FormMessage>{error}</FormMessage> : null}
      <Button
        title="Mark as delivered"
        disabled={collect && !collected}
        loading={busy}
        onPress={() => onSubmit({ type: 'markDelivered', ...(collect ? { collected } : {}) }, wa)}
      />
      <TextButton title="Not yet" onPress={onClose} />
    </ActionSheet>
  );
}

function SellerCancel({ order, busy, error, onClose, onSubmit }: SheetProps) {
  const [reason, setReason] = useState<SellerCancelReason | null>(null);
  const [note, setNote] = useState('');
  const [received, setReceived] = useState<boolean | null>(null);
  const [wa, setWa] = useWhatsApp(order);
  const name = firstName(order.buyer.name);
  const claimed = order.paymentStatus === 'claimed';
  const refund = order.paymentStatus === 'paid' || (claimed && received === true);
  const ready = reason !== null && (!claimed || received !== null);
  return (
    <ActionSheet
      visible
      title={`Cancel order #${order.number}?`}
      subtitle={`${order.buyer.name} · ${formatKsh(order.total)}`}
      onClose={onClose}
    >
      {claimed ? (
        <>
          <Text style={styles.label}>
            Did you receive {formatKsh(order.total)} in M-Pesa from {name}?
          </Text>
          <View style={styles.chips}>
            <Chip
              label="Yes, I got it"
              selected={received === true}
              onPress={() => setReceived(true)}
            />
            <Chip label="No" selected={received === false} onPress={() => setReceived(false)} />
          </View>
        </>
      ) : null}
      <Text style={styles.label}>Why are you cancelling?</Text>
      <View style={styles.chips}>
        {SELLER_CANCEL_REASONS.map((r) => (
          <Chip
            key={r}
            label={SELLER_CANCEL_LABELS[r]}
            selected={reason === r}
            onPress={() => setReason(r)}
          />
        ))}
      </View>
      <Field
        label="Note for yourself"
        labelHint="Optional · the buyer never sees it"
        value={note}
        onChangeText={setNote}
        maxLength={300}
        placeholder="e.g. Sold the last one in the shop"
      />
      {refund ? (
        <View style={styles.refund}>
          <Text style={styles.refundTitle}>Refund the buyer yourself</Text>
          <Text style={styles.refundText}>
            {name} paid {formatKsh(order.total)}. oda never holds your money, so send it back from
            your M-Pesa to {formatKePhone(order.buyer.phone)}.
          </Text>
        </View>
      ) : null}
      <WhatsAppToggle
        name={name}
        line={`${name} gets the reason${refund ? ' and that you’ll refund them' : ''}.`}
        value={wa}
        onChange={setWa}
      />
      {error ? <FormMessage>{error}</FormMessage> : null}
      <Button
        title="Cancel order"
        variant="danger"
        disabled={!ready}
        loading={busy}
        onPress={() =>
          reason &&
          onSubmit(
            {
              type: 'sellerCancel',
              reason,
              note: note.trim() || null,
              ...(claimed && received !== null ? { receivedClaimed: received } : {}),
            },
            wa,
          )
        }
      />
      <TextButton title="Keep order" onPress={onClose} />
    </ActionSheet>
  );
}

function MarkRefundSent({ order, busy, error, onClose, onSubmit }: SheetProps) {
  return (
    <ActionSheet
      visible
      title="Mark refund sent?"
      subtitle={`Only once you’ve sent ${formatKsh(order.total)} back to ${formatKePhone(order.buyer.phone)} on M-Pesa.`}
      onClose={onClose}
    >
      {error ? <FormMessage>{error}</FormMessage> : null}
      <Button
        title="Mark refund sent"
        loading={busy}
        onPress={() => onSubmit({ type: 'markRefundSent' }, false)}
      />
      <TextButton title="Not yet" onPress={onClose} />
    </ActionSheet>
  );
}

function ResolveClaim({ order, busy, error, onClose, onSubmit }: SheetProps) {
  const name = firstName(order.buyer.name);
  return (
    <ActionSheet
      visible
      title={`Did you receive ${formatKsh(order.total)}?`}
      subtitle={`${name} said they paid${order.mpesaCode ? ` with code ${order.mpesaCode}` : ''}, then cancelled. Check your M-Pesa messages.`}
      onClose={onClose}
    >
      {error ? <FormMessage>{error}</FormMessage> : null}
      <Button
        title="Yes, I need to refund it"
        loading={busy}
        onPress={() => onSubmit({ type: 'resolveClaim', received: true }, false)}
      />
      <Button
        title="No, it never arrived"
        variant="secondary"
        disabled={busy}
        onPress={() => onSubmit({ type: 'resolveClaim', received: false }, false)}
      />
    </ActionSheet>
  );
}

function Warning({ children }: { children: ReactNode }) {
  return (
    <View style={styles.warning}>
      <Text style={styles.warningText}>{children}</Text>
    </View>
  );
}

const SHEETS: Record<SheetKind, (p: SheetProps) => ReactElement> = {
  confirmPayment: ConfirmPayment,
  paymentNotFound: PaymentNotFound,
  markPaid: MarkPaid,
  markSent: MarkSent,
  markDelivered: MarkDelivered,
  sellerCancel: SellerCancel,
  markRefundSent: MarkRefundSent,
  resolveClaim: ResolveClaim,
};

/** The sheet for `kind` (give it a new `key` each time it opens, so it starts fresh). */
export function OrderSheet({ kind, ...props }: SheetProps & { kind: SheetKind | null }) {
  if (!kind) return null;
  const Sheet = SHEETS[kind];
  return <Sheet {...props} />;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  label: { ...text('bodyStrong'), fontFamily: 'Poppins_700Bold', color: colors.navy },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: spacing.md,
  },
  optionOn: { borderWidth: 2, borderColor: colors.borderStrong },
  optionIcon: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionTitle: { ...text('subtitle'), fontFamily: 'Poppins_700Bold', color: colors.navy },
  optionLine: { ...text('body'), color: colors.textSecondary },
  radio: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: colors.toggleOff,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { borderColor: colors.navy },
  radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.navy },
  refund: {
    backgroundColor: colors.warningTint,
    borderRadius: radii.lg,
    padding: spacing.md,
    gap: 4,
  },
  refundTitle: {
    ...text('bodyStrong'),
    fontFamily: 'Poppins_700Bold',
    color: colors.warningTextStrong,
  },
  refundText: { ...text('body'), color: colors.warningTextStrong },
  warning: { backgroundColor: colors.warningTint, borderRadius: radii.lg, padding: spacing.md },
  warningText: { ...text('bodyStrong'), color: colors.warningTextStrong },
});
