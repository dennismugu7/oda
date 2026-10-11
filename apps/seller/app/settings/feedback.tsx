// Share feedback (design 21-share-feedback): what it's about, the message (500 characters),
// an optional screenshot and "You can reply to me on WhatsApp". It reaches the oda team in the
// daily support digest. "Add screenshot" shows only once the private store is connected
// (decision #74 b).
import Feather from '@expo/vector-icons/Feather';
import { FEEDBACK_MAX, formatKePhone, type FeedbackKind } from '@oda/shared';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { errorMessage } from '@/onboarding/labels';
import { DraftBanner } from '@/restore/DraftBanner';
import { useDraft } from '@/restore/useDraft';
import { nativePhotoDeps, pickPhotos } from '@/onboarding/nativePhotos';
import { uploadScreenshot, type Picked } from '@/onboarding/photos';
import { settingsApi, type FeedbackForm } from '@/settings/api';
import { FEEDBACK_CHOICES } from '@/settings/form';
import { goBack, SettingsLayout } from '@/settings/SettingsLayout';
import { memoryCache, useLoaded } from '@/settings/useLoaded';
import { Button, FormMessage } from '@/ui/auth';
import { Card, rowStyles, ToggleRow } from '@/ui/rows';
import { colors, fonts, radii, spacing, text } from '@/theme';

const cache = memoryCache<FeedbackForm>();

export default function ShareFeedback() {
  const { data, error, offline, reload } = useLoaded(settingsApi.feedbackForm, cache);
  // Help → "Report a problem" opens on "Something's broken", "Suggest an idea" on "An idea".
  const { kind: start } = useLocalSearchParams<{ kind?: string }>();
  const [kind, setKind] = useState<FeedbackKind>(
    FEEDBACK_CHOICES.find((c) => c.kind === start)?.kind ?? 'idea',
  );
  const [message, setMessage] = useState('');
  const [shot, setShot] = useState<Picked | null>(null);
  const [reply, setReply] = useState(true);
  const [busy, setBusy] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [sent, setSent] = useState(false);
  const [focused, setFocused] = useState(false);

  // The message survives Android closing the app (decision #100); a screenshot isn't kept.
  const draft = useDraft<{ kind: FeedbackKind; message: string; reply: boolean }>('feedback', {
    value: { kind, message, reply },
    worthSaving: !sent && !!message.trim(),
    restore: (saved) => {
      setKind(saved.kind);
      setMessage(saved.message);
      setReply(saved.reply);
    },
  });

  async function pick() {
    const { photos, error: pickError } = await pickPhotos('library', 1);
    if (pickError) setSendError(pickError);
    if (photos[0]) setShot(photos[0]);
  }

  async function send() {
    setSendError(null);
    setFields({});
    if (!message.trim()) {
      setFields({ message: 'Tell us a bit more first.' });
      return;
    }
    setBusy(true);
    let screenshotPath: string | null = null;
    if (shot) {
      const uploaded = await uploadScreenshot(shot, nativePhotoDeps);
      if (!uploaded.key) {
        setBusy(false);
        setSendError(
          `${uploaded.error ?? "Couldn't upload the screenshot."} Remove it to send without.`,
        );
        return;
      }
      screenshotPath = uploaded.key;
    }
    const { data: ok, error: failed } = await settingsApi.sendFeedback({
      kind,
      message: message.trim(),
      screenshotPath,
      replyOnWhatsapp: reply,
    });
    setBusy(false);
    if (ok) {
      setSent(true);
      draft.discard();
      return;
    }
    setSendError(errorMessage(failed));
    setFields(failed?.fields ?? {});
  }

  return (
    <SettingsLayout
      title="Share feedback"
      subtitle="Every message is read by the oda team"
      loaded={!!data}
      error={error}
      offline={offline}
      onRetry={reload}
      back={() => goBack('/settings')}
    >
      {data && sent ? (
        <>
          <Card padded>
            <View style={styles.thanks}>
              <Feather name="heart" size={28} color={colors.primary} />
              <Text style={styles.thanksTitle}>Thank you!</Text>
              <Text style={styles.thanksText}>
                We read every message.
                {reply ? ' If we have a question, we’ll reply on WhatsApp.' : ''}
              </Text>
            </View>
          </Card>
          <Button title="Done" onPress={() => goBack('/settings')} />
        </>
      ) : data ? (
        <>
          <DraftBanner
            visible={draft.restored}
            onDiscard={() => {
              draft.discard();
              setMessage('');
            }}
          />
          {sendError ? <FormMessage>{sendError}</FormMessage> : null}
          <Card padded>
            <Text style={rowStyles.overline}>WHAT&apos;S IT ABOUT?</Text>
            <View style={styles.chips} accessibilityRole="radiogroup">
              {FEEDBACK_CHOICES.map((c) => {
                const on = kind === c.kind;
                return (
                  <Pressable
                    key={c.kind}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    onPress={() => setKind(c.kind)}
                    style={({ pressed }) => [
                      styles.chip,
                      on && styles.chipOn,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Feather name={c.icon} size={18} color={on ? colors.textOnNavy : colors.navy} />
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>{c.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </Card>

          <Card padded>
            <Text style={rowStyles.overline}>TELL US MORE</Text>
            <TextInput
              accessibilityLabel="Tell us more"
              value={message}
              onChangeText={setMessage}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder="What happened, or what would help?"
              placeholderTextColor={colors.textMuted}
              multiline
              maxLength={FEEDBACK_MAX}
              textAlignVertical="top"
              style={[
                styles.message,
                focused && styles.messageFocused,
                !!fields.message && styles.messageError,
              ]}
            />
            <View style={styles.countRow}>
              {fields.message ? <Text style={styles.fieldError}>{fields.message}</Text> : <View />}
              <Text style={styles.count}>
                {message.length} / {FEEDBACK_MAX}
              </Text>
            </View>
            {data.screenshots ? (
              <>
                <View style={styles.shotHead}>
                  <Text style={styles.label}>Screenshot</Text>
                  <Text style={styles.optional}>Optional</Text>
                </View>
                {shot ? (
                  <View style={styles.shotRow}>
                    <Image source={{ uri: shot.uri }} style={styles.shot} resizeMode="cover" />
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Remove the screenshot"
                      onPress={() => setShot(null)}
                      style={styles.remove}
                    >
                      <Feather name="x" size={16} color={colors.navy} />
                      <Text style={styles.removeText}>Remove</Text>
                    </Pressable>
                  </View>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Add a screenshot"
                    onPress={pick}
                    style={({ pressed }) => [styles.add, pressed && styles.pressed]}
                  >
                    <Feather name="camera" size={20} color={colors.navy} />
                    <Text style={styles.addText}>Add</Text>
                  </Pressable>
                )}
              </>
            ) : null}
          </Card>

          <Card>
            <ToggleRow
              first
              title="You can reply to me on WhatsApp"
              line={formatKePhone(data.whatsappPhone).replace(/^0/, '+254 ')}
              value={reply}
              onToggle={setReply}
            />
          </Card>
          <Button title="Send feedback" onPress={send} loading={busy} disabled={offline} />
        </>
      ) : null}
    </SettingsLayout>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipOn: { backgroundColor: colors.navy, borderColor: colors.navy },
  chipText: { ...text('bodyStrong'), fontFamily: fonts.bold, color: colors.navy },
  chipTextOn: { color: colors.textOnNavy },
  message: {
    ...text('body'),
    color: colors.text,
    minHeight: 120,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: spacing.md,
  },
  messageFocused: { borderColor: colors.navy },
  messageError: { borderColor: colors.danger },
  countRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  count: { ...text('small'), color: colors.textMuted },
  fieldError: { ...text('small'), color: colors.danger, flex: 1 },
  shotHead: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm },
  label: { ...text('bodyStrong'), color: colors.navy },
  optional: { ...text('body'), color: colors.textMuted },
  add: {
    width: 72,
    height: 72,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.toggleOff,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  addText: { ...text('small'), fontFamily: fonts.bold, color: colors.navy },
  shotRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  shot: { width: 72, height: 96, borderRadius: radii.md, backgroundColor: colors.beige },
  remove: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 44,
    minWidth: 44,
  },
  removeText: { ...text('bodyStrong'), color: colors.navy },
  thanks: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  thanksTitle: { ...text('title'), color: colors.navy },
  thanksText: { ...text('body'), color: colors.textSecondary, textAlign: 'center' },
  pressed: { opacity: 0.85 },
});
