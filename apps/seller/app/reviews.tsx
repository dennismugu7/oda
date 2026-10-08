// Reviews (design 20b-reviews, M7 CP3, decision #73): tabs All / Needs reply / Low ratings
// (1–3★) with counts, the summary card (average, stars, 5→1 histogram), review cards (name,
// stars, day, each item's text with its product chip, photos, tags), one editable reply per
// review, and ⋮ → Report review (its photos are hidden from buyers at once). A tapped
// new_review notification opens this screen at that review. Offline: the saved list, read-only.
import Feather from '@expo/vector-icons/Feather';
import { daysAgo, REVIEW_REPLY_MAX, REVIEW_REPORT_REASON_MAX, type ReviewTab } from '@oda/shared';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { errorMessage } from '@/onboarding/labels';
import { ActionSheet } from '@/orders/parts';
import { reviewsApi, type ReviewList, type SellerReview } from '@/reviews/api';
import { replaceReview, reviewsCache } from '@/reviews/cache';
import { avatarFor, emptyText, histogramBars, REVIEW_TABS, reviewLabel } from '@/reviews/view';
import { Button, Field, FormMessage } from '@/ui/auth';
import { LoadMoreFailed, OfflineBar } from '@/ui/offline';
import { Sheet } from '@/ui/sheet';
import { Star } from '@/ui/star';
import { colors, radii, spacing, text } from '@/theme';

function Stars({ rating, size = 16 }: { rating: number; size?: number }) {
  return (
    <View
      accessible
      accessibilityLabel={`${rating} out of 5 stars`}
      style={{ flexDirection: 'row', gap: 2, paddingVertical: 2 }}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} filled={n <= rating} size={size} />
      ))}
    </View>
  );
}

function Summary({ summary }: { summary: ReviewList['summary'] }) {
  const avg = summary.average;
  return (
    <View style={styles.summary}>
      <View style={styles.summaryLeft}>
        <Text style={styles.average}>{avg === null ? '–' : avg.toFixed(1)}</Text>
        <Stars rating={avg === null ? 0 : Math.round(avg)} size={18} />
        <Text style={styles.muted}>
          {summary.count} {summary.count === 1 ? 'review' : 'reviews'}
        </Text>
      </View>
      <View style={styles.bars}>
        {histogramBars(summary).map((h) => (
          <View
            key={h.stars}
            style={styles.barRow}
            accessible
            accessibilityLabel={`${h.stars} stars: ${h.count}`}
          >
            <Text style={styles.barLabel}>{h.stars}</Text>
            <View style={styles.track}>
              {h.count ? (
                <View style={[styles.fill, { width: `${Math.max(4, h.fill * 100)}%` }]} />
              ) : null}
            </View>
            <Text style={styles.barCount}>{h.count}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function ReviewCard({
  review,
  now,
  highlighted,
  onReply,
  onMenu,
  onPhoto,
}: {
  review: SellerReview;
  now: Date;
  highlighted: boolean;
  onReply: () => void;
  onMenu: () => void;
  onPhoto: (uri: string) => void;
}) {
  const avatar = avatarFor(review.buyerDisplayName);
  const when = daysAgo(new Date(review.createdAt), now);
  const photos = review.items.flatMap((i) => (i.photoUrl ? [i.photoUrl] : []));
  return (
    <View style={[styles.card, highlighted && styles.cardHighlighted]}>
      <View style={styles.cardHead}>
        <View style={[styles.avatar, { backgroundColor: avatar.background }]}>
          <Text style={[styles.avatarText, { color: avatar.color }]}>{avatar.letter}</Text>
        </View>
        <View style={styles.flex} accessible accessibilityLabel={reviewLabel(review, when)}>
          <Text style={styles.name}>{review.buyerDisplayName}</Text>
          <View style={styles.starsRow}>
            <Stars rating={review.rating} />
            <Text style={styles.muted}>
              {' '}
              · {when} · #{review.orderNumber}
              {review.edited ? ' · edited' : ''}
            </Text>
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`More actions for ${review.buyerDisplayName}’s review`}
          hitSlop={12}
          onPress={onMenu}
          style={styles.menu}
        >
          <Feather name="more-vertical" size={22} color={colors.textSecondary} />
        </Pressable>
      </View>

      {review.items.map((item) => (
        <View key={item.orderItemId} style={styles.item}>
          {item.text ? <Text style={styles.reviewText}>{item.text}</Text> : null}
          <View style={styles.chipRow}>
            <View style={styles.chip}>
              <Text style={styles.chipText}>{item.productName}</Text>
            </View>
            {item.rating !== null ? <Stars rating={item.rating} size={13} /> : null}
          </View>
        </View>
      ))}

      {review.tags.length ? <Text style={styles.tags}>{review.tags.join(' · ')}</Text> : null}

      {photos.length ? (
        <View style={styles.photos}>
          {photos.map((uri) => (
            <Pressable
              key={uri}
              accessibilityRole="imagebutton"
              accessibilityLabel={`Photo from ${review.buyerDisplayName}, show bigger`}
              onPress={() => onPhoto(uri)}
            >
              <Image source={{ uri }} style={styles.photo} />
            </Pressable>
          ))}
        </View>
      ) : null}
      {review.reportedAt ? (
        <View style={styles.reported}>
          <Feather name="flag" size={14} color={colors.warningTextStrong} />
          <Text style={styles.reportedText}>
            Reported{photos.length ? ' · photos hidden from buyers' : ''}
          </Text>
        </View>
      ) : null}

      {review.sellerReply ? (
        <View style={styles.reply}>
          <View style={styles.replyHead}>
            <Text style={styles.replyTitle}>Your reply</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Edit your reply"
              hitSlop={12}
              onPress={onReply}
            >
              <Text style={styles.link}>Edit</Text>
            </Pressable>
          </View>
          <Text style={styles.replyText}>{review.sellerReply}</Text>
        </View>
      ) : (
        <View style={styles.noReply}>
          <Text style={styles.muted}>No reply yet</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Reply to ${review.buyerDisplayName}`}
            onPress={onReply}
            style={({ pressed }) => [styles.replyButton, pressed && styles.pressed]}
          >
            <Feather name="corner-up-left" size={20} color={colors.navy} />
            <Text style={styles.replyButtonText}>Reply</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

export default function ReviewsScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ review?: string }>();
  const [tab, setTab] = useState<ReviewTab>('all');
  const [list, setList] = useState<ReviewList | null>(reviewsCache.list('all'));
  const [focused, setFocused] = useState<SellerReview | null>(null);
  /** The notification's review was removed (decision #73) before the seller opened it. */
  const [focusGone, setFocusGone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  /** The tab whose next page didn't load (its footer offers a retry). */
  const [moreFailed, setMoreFailed] = useState<ReviewTab | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [replying, setReplying] = useState<SellerReview | null>(null);
  const [reply, setReply] = useState('');
  const [menuFor, setMenuFor] = useState<SellerReview | null>(null);
  const [reporting, setReporting] = useState<SellerReview | null>(null);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  // The tab whose answer may still be shown (switchTab keeps it current; a late answer for
  // another tab is dropped).
  const tabRef = useRef<ReviewTab>('all');

  const load = useCallback(async (which: ReviewTab) => {
    const { data, error: failed } = await reviewsApi.list(which);
    if (tabRef.current !== which) return;
    setNow(new Date());
    if (data) {
      reviewsCache.setList(which, data);
      setList(data);
      setError(null);
      setOffline(false);
    } else {
      setOffline(failed?.code === 'OFFLINE');
      setError(errorMessage(failed));
    }
  }, []);

  // The review a tapped notification points at, shown first and outlined.
  const focusId = typeof params.review === 'string' ? params.review : null;
  const loadFocused = useCallback(async () => {
    if (!focusId) return;
    const { data, error: failed } = await reviewsApi.get(focusId);
    if (data) setFocused(data);
    if (failed?.status === 404) {
      setFocused(null);
      setFocusGone(true);
    }
  }, [focusId]);

  useFocusEffect(
    useCallback(() => {
      load(tabRef.current);
      loadFocused();
    }, [load, loadFocused]),
  );

  function switchTab(next: ReviewTab) {
    setTab(next);
    tabRef.current = next;
    setList(reviewsCache.list(next));
    load(next);
  }

  /** `retry`: the seller tapped the footer (scrolling doesn't retry a failed page). */
  async function more(retry = false) {
    if (!list?.next || loadingMore || (moreFailed === tab && !retry)) return;
    setLoadingMore(true);
    setMoreFailed(null);
    const which = tab;
    const { data } = await reviewsApi.list(which, list.next);
    setLoadingMore(false);
    if (tabRef.current !== which) return;
    if (!data) {
      setMoreFailed(which);
      return;
    }
    const merged = {
      ...data,
      reviews: [
        ...list.reviews,
        ...data.reviews.filter((r) => !list.reviews.some((x) => x.id === r.id)),
      ],
    };
    reviewsCache.setList(which, merged);
    setList(merged);
  }

  /** A reply or report came back: update every copy, then refresh counts. */
  function updated(review: SellerReview) {
    reviewsCache.update(review);
    setList((l) => (l ? replaceReview(l, review) : l));
    setFocused((f) => (f?.id === review.id ? review : f));
    load(tabRef.current);
  }

  function openReply(r: SellerReview) {
    setSheetError(null);
    setReply(r.sellerReply ?? '');
    setReplying(r);
  }

  async function saveReply(value: string) {
    if (!replying) return;
    setSaving(true);
    setSheetError(null);
    const { data, error: failed } = await reviewsApi.reply(replying.id, value);
    setSaving(false);
    if (!data) return setSheetError(errorMessage(failed));
    setReplying(null);
    updated(data);
  }

  async function report() {
    if (!reporting) return;
    setSaving(true);
    setSheetError(null);
    const { data, error: failed } = await reviewsApi.report(reporting.id, reason.trim());
    setSaving(false);
    if (!data) return setSheetError(errorMessage(failed));
    setReporting(null);
    updated(data);
  }

  const back = () => (router.canGoBack() ? router.back() : router.replace('/more'));
  const reviews = (list?.reviews ?? []).filter((r) => r.id !== focused?.id);
  const card = (r: SellerReview, highlighted = false) => (
    <ReviewCard
      review={r}
      now={now}
      highlighted={highlighted}
      onReply={() => openReply(r)}
      onMenu={() => setMenuFor(r)}
      onPhoto={setPhoto}
    />
  );

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
      <StatusBar style="light" />
      <View style={styles.titleRow}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" hitSlop={12} onPress={back}>
          <Feather name="chevron-left" size={30} color={colors.textOnNavy} />
        </Pressable>
        <View style={styles.flex}>
          <Text accessibilityRole="header" style={styles.title}>
            Reviews
          </Text>
          <Text style={styles.subtitle}>From buyers after delivery</Text>
        </View>
      </View>
      <View style={styles.tabs} accessibilityRole="tablist">
        {REVIEW_TABS.map((t) => {
          const on = t.key === tab;
          const n = list?.counts[t.key];
          return (
            <Pressable
              key={t.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={n === undefined ? t.label : `${t.label}, ${n}`}
              onPress={() => switchTab(t.key)}
              style={[styles.tab, on && styles.tabOn]}
            >
              <Text style={[styles.tabText, on && styles.tabTextOn]} numberOfLines={1}>
                {t.label}
                {n !== undefined ? ` ${n}` : ''}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  const banner =
    offline || error ? (
      <View style={styles.banner}>
        {offline ? <OfflineBar saved={!!list} /> : <FormMessage>{error}</FormMessage>}
      </View>
    ) : null;

  const note = (
    <View style={styles.note}>
      <Feather name="info" size={18} color={colors.textSecondary} />
      <Text style={styles.noteText}>
        Buyers get a review link in your WhatsApp message and their email when you mark an order as
        delivered.
      </Text>
    </View>
  );

  return (
    <View style={styles.screen}>
      {header}
      {!list ? (
        <View style={styles.body}>
          {banner}
          {error ? (
            <Button title="Try again" onPress={() => load(tab)} />
          ) : (
            <ActivityIndicator style={styles.loading} color={colors.primary} />
          )}
        </View>
      ) : (
        <FlatList
          data={reviews}
          keyExtractor={(r) => r.id}
          contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl }]}
          onEndReached={() => more()}
          onEndReachedThreshold={0.5}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true);
                await Promise.all([load(tab), loadFocused()]);
                setRefreshing(false);
              }}
              colors={[colors.primary]}
            />
          }
          ListHeaderComponent={
            <View style={styles.headerGap}>
              {banner}
              {list.summary.count ? <Summary summary={list.summary} /> : null}
              {focusGone ? <FormMessage tone="info">That review was removed.</FormMessage> : null}
              {focused ? card(focused, true) : null}
            </View>
          }
          renderItem={({ item }) => card(item)}
          ListEmptyComponent={
            focused ? null : (
              <View style={styles.empty}>
                <Feather name="star" size={28} color={colors.primary} />
                <Text style={styles.emptyTitle}>{emptyText(tab).title}</Text>
                <Text style={styles.emptyLine}>{emptyText(tab).line}</Text>
              </View>
            )
          }
          ListFooterComponent={
            <>
              {loadingMore ? (
                <ActivityIndicator color={colors.primary} />
              ) : moreFailed === tab ? (
                <LoadMoreFailed onRetry={() => more(true)} />
              ) : null}
              {note}
            </>
          }
        />
      )}

      <ActionSheet
        visible={!!replying}
        title={
          replying?.sellerReply ? 'Edit your reply' : `Reply to ${replying?.buyerDisplayName ?? ''}`
        }
        subtitle="Buyers see your reply under the review on your shop page."
        onClose={() => setReplying(null)}
      >
        <Field
          label="Your reply"
          labelHint={`${reply.length}/${REVIEW_REPLY_MAX}`}
          value={reply}
          onChangeText={setReply}
          maxLength={REVIEW_REPLY_MAX}
          multiline
          textAlignVertical="top"
          style={styles.replyInput}
          placeholder="Asante! …"
        />
        {sheetError ? <FormMessage>{sheetError}</FormMessage> : null}
        <Button
          title="Save reply"
          onPress={() => saveReply(reply)}
          loading={saving}
          disabled={!reply.trim()}
        />
        {replying?.sellerReply ? (
          <Button
            title="Remove reply"
            variant="secondary"
            onPress={() => saveReply('')}
            disabled={saving}
          />
        ) : null}
      </ActionSheet>

      <Sheet
        visible={!!menuFor}
        title={menuFor ? `${menuFor.buyerDisplayName} · #${menuFor.orderNumber}` : ''}
        onClose={() => setMenuFor(null)}
        options={
          menuFor
            ? [
                {
                  key: 'reply',
                  label: menuFor.sellerReply ? 'Edit your reply' : 'Reply',
                  icon: 'corner-up-left',
                  onPress: () => openReply(menuFor),
                },
                {
                  key: 'order',
                  label: `Open order #${menuFor.orderNumber}`,
                  icon: 'shopping-bag',
                  onPress: () =>
                    router.push({ pathname: '/orders/[id]', params: { id: menuFor.orderId } }),
                },
                menuFor.reportedAt
                  ? {
                      key: 'reported',
                      label: 'Reported to oda',
                      icon: 'flag',
                      selected: true,
                      onPress: () => undefined,
                    }
                  : {
                      key: 'report',
                      label: 'Report review',
                      icon: 'flag',
                      destructive: true,
                      onPress: () => {
                        setSheetError(null);
                        setReason('');
                        setReporting(menuFor);
                      },
                    },
              ]
            : []
        }
      />

      <ActionSheet
        visible={!!reporting}
        title="Report this review?"
        subtitle="For abuse, spam or a review that isn’t about this order."
        onClose={() => setReporting(null)}
      >
        <Text style={styles.sheetLine}>
          Its photos are hidden from buyers at once. The stars and text stay, and it still counts in
          your rating, unless oda removes it.
        </Text>
        <Field
          label="What’s wrong?"
          labelHint="Optional"
          value={reason}
          onChangeText={setReason}
          maxLength={REVIEW_REPORT_REASON_MAX}
          multiline
          textAlignVertical="top"
          style={styles.reasonInput}
        />
        {sheetError ? <FormMessage>{sheetError}</FormMessage> : null}
        <Button title="Report review" variant="danger" onPress={report} loading={saving} />
      </ActionSheet>

      <Modal
        visible={!!photo}
        transparent
        animationType="fade"
        onRequestClose={() => setPhoto(null)}
      >
        <Pressable
          style={styles.viewer}
          accessibilityRole="button"
          accessibilityLabel="Close the photo"
          onPress={() => setPhoto(null)}
        >
          {photo ? (
            <Image source={{ uri: photo }} style={styles.viewerImage} resizeMode="contain" />
          ) : null}
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  header: {
    backgroundColor: colors.navy,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    borderBottomLeftRadius: radii.sheet + 8,
    borderBottomRightRadius: radii.sheet + 8,
    gap: spacing.md,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { ...text('headline'), color: colors.textOnNavy },
  subtitle: { ...text('body'), color: colors.toggleOff },
  tabs: {
    flexDirection: 'row',
    backgroundColor: colors.navyRaised,
    borderRadius: radii.lg,
    padding: spacing.xs,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    borderRadius: radii.md,
    paddingHorizontal: spacing.xs,
  },
  tabOn: { backgroundColor: colors.surface },
  tabText: { ...text('body'), fontFamily: 'Poppins_700Bold', color: colors.toggleOff },
  tabTextOn: { color: colors.navy },
  body: { padding: spacing.lg, gap: spacing.md },
  headerGap: { gap: spacing.md },
  banner: { gap: spacing.sm },
  loading: { marginTop: spacing.xxl },
  summary: {
    flexDirection: 'row',
    gap: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  summaryLeft: { alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  average: { ...text('display'), fontSize: 44, lineHeight: 50, color: colors.navy },
  bars: { flex: 1, gap: spacing.xs, justifyContent: 'center' },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  barLabel: { ...text('small'), color: colors.textSecondary, width: 12 },
  barCount: { ...text('small'), color: colors.textSecondary, width: 28, textAlign: 'right' },
  track: { flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.track, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4, backgroundColor: colors.star },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  cardHighlighted: { borderColor: colors.primary, borderWidth: 2 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { ...text('subtitle'), fontFamily: 'Poppins_700Bold' },
  name: { ...text('subtitle'), fontFamily: 'Poppins_700Bold', color: colors.navy },
  starsRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  menu: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  item: { gap: spacing.xs },
  reviewText: { ...text('body'), fontSize: 16, lineHeight: 24, color: colors.navy },
  chipRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  chip: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
  },
  chipText: { ...text('small'), fontFamily: 'Poppins_600SemiBold', color: colors.navyMuted },
  tags: { ...text('small'), color: colors.textSecondary },
  photos: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  photo: { width: 72, height: 72, borderRadius: radii.md, backgroundColor: colors.beige },
  reported: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'flex-start',
    backgroundColor: colors.warningTint,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
  },
  reportedText: {
    ...text('small'),
    fontFamily: 'Poppins_600SemiBold',
    color: colors.warningTextStrong,
  },
  noReply: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  replyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 44,
    paddingHorizontal: spacing.sm,
  },
  replyButtonText: { ...text('subtitle'), fontFamily: 'Poppins_700Bold', color: colors.navy },
  reply: {
    backgroundColor: colors.background,
    borderRadius: radii.lg,
    padding: spacing.md,
    gap: spacing.xxs,
  },
  replyHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  replyTitle: { ...text('bodyStrong'), fontFamily: 'Poppins_700Bold', color: colors.navy },
  replyText: { ...text('body'), color: colors.textSecondary },
  link: { ...text('bodyStrong'), color: colors.primary },
  muted: { ...text('body'), color: colors.textSecondary },
  note: { flexDirection: 'row', gap: spacing.sm, paddingTop: spacing.md },
  noteText: { ...text('body'), color: colors.textSecondary, flex: 1 },
  empty: { alignItems: 'center', gap: spacing.sm, paddingTop: spacing.xl },
  emptyTitle: { ...text('title'), color: colors.navy },
  emptyLine: { ...text('body'), color: colors.textSecondary, textAlign: 'center' },
  replyInput: { minHeight: 110 },
  reasonInput: { minHeight: 80 },
  sheetLine: { ...text('body'), color: colors.textSecondary },
  viewer: {
    flex: 1,
    backgroundColor: 'rgba(28,26,46,0.92)', // navy at 92%
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerImage: { width: '100%', height: '80%' },
  pressed: { opacity: 0.85 },
});
