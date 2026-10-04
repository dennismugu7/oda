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

/** Lets a Field ask its screen to scroll it (and its rules) into view when focused. */
const RevealContext = createContext<((block: View | null) => void) | null>(null);

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
}: {
  children: ReactNode;
  footer?: ReactNode;
  note?: ReactNode;
  back?: boolean;
}) {
  const keyboardVisible = useKeyboardVisible();
  const scroll = useRef<ScrollView>(null);
  const content = useRef<View>(null);
  const focused = useRef<View | null>(null);
  const viewport = useRef(0);
  const scrollY = useRef(0);

  const reveal = useCallback(() => {
    const block = focused.current;
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

  useEffect(() => {
    // Once the keyboard is up (and the view has shrunk), bring the focused field into view.
    const sub = Keyboard.addListener('keyboardDidShow', () => setTimeout(reveal, 50));
    return () => sub.remove();
  }, [reveal]);

  const onFocusBlock = useMemo(
    () => (block: View | null) => {
      focused.current = block;
      setTimeout(reveal, 50);
    },
    [reveal],
  );

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        <RevealContext.Provider value={onFocusBlock}>
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
              {back ? <BackButton /> : <View style={styles.backSpacer} />}
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
  /** Shown under the field (e.g. password rules) and kept in view with it. */
  children?: ReactNode;
};

export const Field = forwardRef<TextInput, FieldProps>(function Field(
  { label, error, right, children, style, onFocus, onBlur, ...input },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const block = useRef<View>(null);
  const reveal = useContext(RevealContext);
  return (
    <View ref={block} collapsable={false} style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.inputBox, focused && styles.inputFocused, !!error && styles.inputError]}>
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          placeholderTextColor={colors.textMuted}
          style={[styles.input, style]}
          onFocus={(e) => {
            setFocused(true);
            reveal?.(block.current);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
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

export function ErrorMessage({ children }: { children: ReactNode }) {
  return (
    <View accessibilityLiveRegion="polite" style={styles.errorBox}>
      <Feather name="alert-circle" size={18} color={colors.warningTextStrong} />
      <Text style={styles.errorText}>{children}</Text>
    </View>
  );
}

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
  note: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  noteText: { ...text('body'), color: colors.textSecondary, flex: 1 },
});
