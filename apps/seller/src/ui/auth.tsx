// Building blocks for the auth screens (designs 02, 03, 05 and the new forgot-password
// screen): page layout, wordmark, fields, buttons and notices. Brand colours and Poppins
// everywhere (docs/design-changes.md).
import Feather from '@expo/vector-icons/Feather';
import { router } from 'expo-router';
import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { passwordChecks } from '@oda/shared';
import { colors, radii, sizes, spacing, text } from '@/theme';
import { revealOffset } from './reveal';

/** True while the on-screen keyboard is open. */
export function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return visible;
}

/**
 * Lets a Field ask its screen to scroll it (and its rules) into view while focused, and a
 * form-level message to scroll itself into view when it appears (Step 49).
 */
interface Reveal {
  focus: (block: View | null) => void;
  blur: (block: View | null) => void;
  show: (block: View | null) => void;
}
const RevealContext = createContext<Reveal | null>(null);

/**
 * Auth page layout (Step 47, fix 1). The main button sits in a footer pinned above the
 * keyboard; the form scrolls so the focused field, its error and its rules stay visible.
 * `note` (terms, links) hides while the keyboard is open to leave room for the form.
 * Android draws edge to edge, so the window no longer shrinks for the keyboard: the
 * KeyboardAvoidingView pads on both platforms.
 */
export function AuthScreen({
  children,
  footer,
  note,
  back = true,
  header,
}: {
  children: ReactNode;
  footer?: ReactNode;
  note?: ReactNode;
  back?: boolean;
  /** A fixed header above the form (onboarding); it handles the top inset itself. */
  header?: ReactNode;
}) {
  const keyboardVisible = useKeyboardVisible();
  const scroll = useRef<ScrollView>(null);
  const content = useRef<View>(null);
  const focused = useRef<View | null>(null);
  const viewport = useRef(0);
  const scrollY = useRef(0);

  const scrollTo = useCallback((block: View | null) => {
    if (!block || !content.current) return;
    block.measureLayout(
      content.current,
      (_x, y, _w, height) => {
        const target = revealOffset({
          fieldTop: y,
          fieldHeight: height,
          viewportHeight: viewport.current,
          scrollY: scrollY.current,
        });
        if (target !== null) scroll.current?.scrollTo({ y: target, animated: true });
      },
      () => {},
    );
  }, []);

  /** Keeps the focused field (with its error and rules) in view. */
  const reveal = useCallback(() => scrollTo(focused.current), [scrollTo]);

  useEffect(() => {
    // Once the keyboard is up (and the view has shrunk), bring the focused field into view.
    const sub = Keyboard.addListener('keyboardDidShow', () => setTimeout(reveal, 50));
    return () => sub.remove();
  }, [reveal]);

  const revealApi = useMemo<Reveal>(
    () => ({
      focus: (block) => {
        focused.current = block;
        setTimeout(reveal, 50);
      },
      blur: (block) => {
        if (focused.current === block) focused.current = null;
      },
      // After the keyboard closes (submit dismisses it) the view grows; scroll once it has.
      show: (block) => {
        setTimeout(() => scrollTo(block), 50);
        setTimeout(() => scrollTo(block), 350);
      },
    }),
    [reveal, scrollTo],
  );

  return (
    <SafeAreaView style={styles.screen} edges={header ? ['bottom'] : ['top', 'bottom']}>
      {header}
      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        <RevealContext.Provider value={revealApi}>
          <ScrollView
            ref={scroll}
            style={styles.flex}
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            scrollEventThrottle={16}
            onScroll={(e) => {
              scrollY.current = e.nativeEvent.contentOffset.y;
            }}
            onLayout={(e) => {
              viewport.current = e.nativeEvent.layout.height;
              reveal();
            }}
          >
            <View ref={content} collapsable={false}>
              {header ? null : back ? <BackButton /> : <View style={styles.backSpacer} />}
              {children}
            </View>
          </ScrollView>
        </RevealContext.Provider>
        {footer || (note && !keyboardVisible) ? (
          <View style={styles.footer}>
            {footer}
            {note && !keyboardVisible ? note : null}
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function BackButton() {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Back"
      hitSlop={12}
      onPress={() => (router.canGoBack() ? router.back() : router.replace('/welcome'))}
      style={styles.back}
    >
      <Feather name="chevron-left" size={30} color={colors.navy} />
    </Pressable>
  );
}

/** "oda." with the green dot on the text baseline, like a full stop. */
export function Wordmark({ size = 48 }: { size?: number }) {
  return (
    <Text
      accessibilityRole="header"
      accessibilityLabel="oda"
      style={[styles.wordmark, { fontSize: size, lineHeight: size * 1.15 }]}
    >
      oda<Text style={styles.wordmarkDot}>.</Text>
    </Text>
  );
}

export function Title({ children }: { children: ReactNode }) {
  return <Text style={styles.title}>{children}</Text>;
}

export function Subtitle({ children }: { children: ReactNode }) {
  return <Text style={styles.subtitle}>{children}</Text>;
}

type FieldProps = TextInputProps & {
  label: string;
  error?: string | null;
  right?: ReactNode;
  /** A fixed prefix inside the box (e.g. "+254", "KSh"). */
  left?: ReactNode;
  /** Muted text at the end of the label row (e.g. "Optional"). */
  labelHint?: string;
  /** Shown under the field (e.g. password rules) and kept in view with it. */
  children?: ReactNode;
};

export const Field = forwardRef<TextInput, FieldProps>(function Field(
  { label, error, right, left, labelHint, children, style, onFocus, onBlur, ...input },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const block = useRef<View>(null);
  const reveal = useContext(RevealContext);
  return (
    <View ref={block} collapsable={false} style={styles.field}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        {labelHint ? <Text style={styles.labelHint}>{labelHint}</Text> : null}
      </View>
      <View style={[styles.inputBox, focused && styles.inputFocused, !!error && styles.inputError]}>
        {left ? <View style={styles.prefix}>{left}</View> : null}
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          placeholderTextColor={colors.textMuted}
          style={[styles.input, style]}
          onFocus={(e) => {
            setFocused(true);
            reveal?.focus(block.current);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            reveal?.blur(block.current);
            onBlur?.(e);
          }}
          {...input}
        />
        {right}
      </View>
      {error ? (
        <Text accessibilityLiveRegion="polite" style={styles.fieldError}>
          {error}
        </Text>
      ) : null}
      {children}
    </View>
  );
});

export const PasswordField = forwardRef<TextInput, Omit<FieldProps, 'right'>>(
  function PasswordField(props, ref) {
    const [visible, setVisible] = useState(false);
    return (
      <Field
        ref={ref}
        secureTextEntry={!visible}
        autoCapitalize="none"
        autoCorrect={false}
        right={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={visible ? 'Hide password' : 'Show password'}
            hitSlop={8}
            onPress={() => setVisible((v) => !v)}
            style={styles.eye}
          >
            <Feather name={visible ? 'eye-off' : 'eye'} size={22} color={colors.textSecondary} />
          </Pressable>
        }
        {...props}
      />
    );
  },
);

/** The password rules under the field, ticking as the seller types. */
export function PasswordRules({ password }: { password: string }) {
  return (
    <View style={styles.rules} accessibilityLabel="Password rules">
      {passwordChecks(password).map((rule) => (
        <View key={rule.label} style={styles.rule}>
          <Feather
            name={rule.ok ? 'check' : 'circle'}
            size={rule.ok ? 16 : 6}
            color={rule.ok ? colors.green : colors.textMuted}
            style={styles.ruleIcon}
          />
          <Text
            style={[styles.ruleText, rule.ok && { color: colors.green }]}
            accessibilityLabel={`${rule.label}: ${rule.ok ? 'done' : 'not yet'}`}
          >
            {rule.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function Button({
  title,
  onPress,
  loading = false,
  disabled = false,
  variant = 'primary',
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary';
}) {
  const primary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        primary ? styles.buttonPrimary : styles.buttonSecondary,
        (disabled || loading) && styles.buttonDisabled,
        pressed && styles.pressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={primary ? colors.textOnPrimary : colors.primary} />
      ) : (
        <Text
          style={[styles.buttonText, { color: primary ? colors.textOnPrimary : colors.primary }]}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
}

/** Underlined inline link inside a sentence. */
export function Link({ children, onPress }: { children: ReactNode; onPress: () => void }) {
  return (
    <Text accessibilityRole="link" onPress={onPress} style={styles.link} suppressHighlighting>
      {children}
    </Text>
  );
}

/**
 * A form-level message (wrong password, offline, too many tries…). It scrolls itself into
 * view whenever it appears or its text changes, and screen readers announce it (Step 49).
 * `revealKey` is what counts as a new message (defaults to string children).
 */
export function FormMessage({
  children,
  tone = 'error',
  revealKey,
}: {
  children: ReactNode;
  tone?: 'error' | 'info';
  revealKey?: string;
}) {
  const block = useRef<View>(null);
  const reveal = useContext(RevealContext);
  const key = revealKey ?? (typeof children === 'string' ? children : undefined);
  useEffect(() => {
    reveal?.show(block.current);
  }, [reveal, key]);
  const error = tone === 'error';
  return (
    <View
      ref={block}
      collapsable={false}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={error ? styles.errorBox : styles.infoBox}
    >
      <Feather
        name={error ? 'alert-circle' : 'check-circle'}
        size={18}
        color={error ? colors.warningTextStrong : colors.green}
      />
      <Text style={error ? styles.errorText : styles.infoText}>{children}</Text>
    </View>
  );
}

export const ErrorMessage = FormMessage;

export function InfoNote({ icon, children }: { icon: 'info' | 'shield'; children: ReactNode }) {
  return (
    <View style={styles.note}>
      <Feather
        name={icon}
        size={18}
        color={icon === 'shield' ? colors.green : colors.textSecondary}
      />
      <Text style={[styles.noteText, icon === 'shield' && { color: colors.textSecondary }]}>
        {children}
      </Text>
    </View>
  );
}

const INPUT_HEIGHT = 52;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: colors.background },
  scroll: { flexGrow: 1, paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  back: {
    width: sizes.minTapTarget,
    height: sizes.minTapTarget,
    marginLeft: -spacing.sm,
    marginTop: spacing.xs,
    justifyContent: 'center',
  },
  backSpacer: { height: sizes.minTapTarget + spacing.xs },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.md,
    backgroundColor: colors.background,
  },

  wordmark: {
    fontFamily: text('display').fontFamily,
    letterSpacing: -2,
    color: colors.primary,
    marginTop: spacing.md,
  },
  wordmarkDot: { color: colors.greenBright },
  title: { ...text('headline'), color: colors.navy, marginTop: spacing.lg },
  subtitle: { ...text('body'), color: colors.textSecondary, marginTop: spacing.sm },

  field: { marginTop: spacing.lg },
  label: { ...text('bodyStrong'), color: colors.text, marginBottom: spacing.sm },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  labelHint: { ...text('body'), color: colors.textMuted },
  prefix: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginLeft: -spacing.md,
    marginRight: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.background,
    borderRightWidth: sizes.borderWidth,
    borderRightColor: colors.border,
    borderTopLeftRadius: radii.lg,
    borderBottomLeftRadius: radii.lg,
  },
  // Fixed height: the thicker focus border grows inwards, so the centre line never moves.
  inputBox: {
    height: INPUT_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: sizes.borderWidth,
    borderColor: colors.border,
    borderRadius: radii.lg,
    paddingLeft: spacing.md,
  },
  inputFocused: {
    borderWidth: sizes.borderWidthStrong,
    borderColor: colors.borderStrong,
    paddingLeft: spacing.md - (sizes.borderWidthStrong - sizes.borderWidth),
  },
  inputError: { borderColor: colors.danger },
  // Android draws the placeholder off-centre when a TextInput has a lineHeight (and adds
  // Poppins' font padding). No lineHeight, no font padding, no vertical padding, centred
  // vertically: typed text, placeholder and the eye icon share one centre line.
  input: {
    fontFamily: text('body').fontFamily,
    fontSize: 16,
    flex: 1,
    alignSelf: 'stretch',
    color: colors.text,
    includeFontPadding: false,
    textAlignVertical: 'center',
    paddingVertical: 0,
    paddingRight: spacing.md,
  },
  eye: {
    width: sizes.minTapTarget,
    height: sizes.minTapTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fieldError: { ...text('small'), color: colors.danger, marginTop: spacing.xs },
  rules: { marginTop: spacing.sm, gap: spacing.xxs },
  rule: { flexDirection: 'row', alignItems: 'center' },
  ruleIcon: { width: 20, textAlign: 'center' },
  ruleText: { ...text('small'), color: colors.textSecondary, marginLeft: spacing.xs },

  button: {
    height: sizes.buttonHeight + 4,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPrimary: { backgroundColor: colors.primary },
  buttonSecondary: { backgroundColor: colors.primaryTint },
  buttonDisabled: { opacity: 0.6 },
  pressed: { opacity: 0.85 },
  buttonText: text('button'),

  link: {
    ...text('bodyStrong'),
    color: colors.navy,
    textDecorationLine: 'underline',
  },
  errorBox: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
    backgroundColor: colors.warningTint,
    borderRadius: radii.md,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  errorText: { ...text('body'), color: colors.warningTextStrong, flex: 1 },
  infoBox: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
    backgroundColor: colors.greenTint,
    borderRadius: radii.md,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  infoText: { ...text('body'), color: colors.green, flex: 1 },
  note: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  noteText: { ...text('body'), color: colors.textSecondary, flex: 1 },
});
