import { Children, useEffect, useState, type ReactNode } from 'react';
import {
  ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View,
  type PressableProps, type StyleProp, type TextInputProps, type TextProps, type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, radius, space } from '@/theme';

export function Screen({ children, onRefresh, footer, padTop = true }: {
  children: ReactNode;
  onRefresh?: () => Promise<unknown>;
  footer?: ReactNode;
  padTop?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const refresh = onRefresh && (async () => {
    setRefreshing(true);
    await onRefresh().catch(() => {});
    setRefreshing(false);
  });
  return (
    <View style={styles.screen}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.scroll, { paddingTop: padTop ? insets.top + space.md : space.md }]}
        {...(refresh ? { refreshControl: <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.volt} /> } : {})}
      >
        {children}
      </ScrollView>
      {footer ? <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>{footer}</View> : null}
    </View>
  );
}

/** Not textTransform: Android measures before transforming, then clips what no longer fits. */
const upper = (children: ReactNode) => Children.map(children, (child) => (typeof child === 'string' ? child.toUpperCase() : child));

export const Title = ({ style, children, ...props }: TextProps) => <Text accessibilityRole="header" style={[styles.title, style]} {...props}>{upper(children)}</Text>;
export const Heading = ({ style, children, ...props }: TextProps) => <Text accessibilityRole="header" style={[styles.heading, style]} {...props}>{upper(children)}</Text>;
export const Label = ({ style, children, ...props }: TextProps) => <Text style={[styles.label, style]} {...props}>{upper(children)}</Text>;
export const Body = ({ style, ...props }: TextProps) => <Text style={[styles.body, style]} {...props} />;
export const Muted = ({ style, ...props }: TextProps) => <Text style={[styles.muted, style]} {...props} />;

export function Button({ title, variant = 'primary', busy, style, disabled, ...props }: PressableProps & {
  title: string;
  variant?: 'primary' | 'ghost' | 'danger';
  busy?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const off = Boolean(disabled || busy);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      disabled={off}
      style={({ pressed }) => [styles.button, styles[variant], pressed && styles.pressed, off && styles.off, style]}
      {...props}
    >
      {busy
        ? <ActivityIndicator color={variant === 'primary' ? colors.voltInk : colors.ink} />
        : <Text style={[styles.buttonText, variant === 'primary' ? styles.primaryText : variant === 'danger' ? styles.dangerText : null]}>{title.toUpperCase()}</Text>}
    </Pressable>
  );
}

export function Card({ children, style, onPress, label }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; label?: string }) {
  if (!onPress) return <View style={[styles.card, style]}>{children}</View>;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed, style]}>
      {children}
    </Pressable>
  );
}

export function Field({ label, error, style, ...props }: TextInputProps & { label: string; error?: string | undefined }) {
  return (
    <View style={styles.field}>
      <Label>{label}</Label>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.ink3}
        style={[styles.input, style]}
        {...props}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

/** Keeps "12." while typing, and reports a number or null. */
export function NumberField({ label, value, onChange, max, decimals = true, style }: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  max: number;
  decimals?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const [text, setText] = useState(value === null ? '' : String(value));
  useEffect(() => {
    if (parseNumber(text, max) !== value) setText(value === null ? '' : String(value));
    // Only outside changes (like a stepper) should rewrite what's being typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <View style={[styles.numberField, style]}>
      <Label>{label}</Label>
      <TextInput
        accessibilityLabel={label}
        keyboardType={decimals ? 'decimal-pad' : 'number-pad'}
        placeholder="–"
        placeholderTextColor={colors.ink3}
        selectTextOnFocus
        value={text}
        onChangeText={(next) => {
          setText(next);
          onChange(parseNumber(next, max));
        }}
        style={styles.numberInput}
      />
    </View>
  );
}

export function parseNumber(text: string, max: number): number | null {
  const value = Number(text.trim().replace(',', '.'));
  if (!text.trim() || !Number.isFinite(value) || value < 0) return null;
  return Math.min(value, max);
}

export function Chip({ title, active, onPress }: { title: string; active?: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(active) }}
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{title}</Text>
    </Pressable>
  );
}

export const Row = ({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) => <View style={[styles.row, style]}>{children}</View>;

export function Empty({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.empty}>
      <Heading style={styles.emptyTitle}>{title}</Heading>
      <Muted style={styles.center}>{body}</Muted>
    </View>
  );
}

export const Loading = () => <ActivityIndicator color={colors.volt} style={styles.loading} />;

/** One skewed segment per exercise, like plates on a bar. */
export function Segments({ total, done }: { total: number; done: number }) {
  return (
    <View style={styles.segments} accessibilityLabel={`${done} of ${total} done`}>
      {Array.from({ length: total }, (_, index) => (
        <View key={index} style={[styles.segment, index < done && styles.segmentDone]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: space.lg, paddingBottom: 48, gap: space.md, width: '100%', maxWidth: 640, alignSelf: 'center' },
  footer: { paddingHorizontal: space.lg, paddingTop: space.md, backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: colors.line, gap: space.sm },
  title: { fontFamily: fonts.display, fontSize: 40, lineHeight: 42, color: colors.ink },
  heading: { fontFamily: fonts.display, fontSize: 24, lineHeight: 28, color: colors.ink },
  label: { fontFamily: fonts.label, fontSize: 13, letterSpacing: 1, color: colors.ink3 },
  body: { fontFamily: fonts.body, fontSize: 16, lineHeight: 22, color: colors.ink },
  muted: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.ink2 },
  button: { minHeight: 52, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.lg },
  primary: { backgroundColor: colors.volt },
  ghost: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line },
  danger: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.danger },
  pressed: { opacity: 0.75 },
  off: { opacity: 0.45 },
  buttonText: { alignSelf: 'stretch', textAlign: 'center', fontFamily: fonts.display, fontSize: 20, color: colors.ink },
  primaryText: { color: colors.voltInk },
  dangerText: { color: colors.danger },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, padding: space.lg, gap: space.sm },
  field: { gap: space.xs },
  input: { minHeight: 50, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: space.md, color: colors.ink, fontFamily: fonts.body, fontSize: 16 },
  error: { fontFamily: fonts.body, fontSize: 13, color: colors.danger },
  numberField: { flex: 1, gap: space.xs },
  numberInput: { minHeight: 50, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, color: colors.ink, fontFamily: fonts.display, fontSize: 24, textAlign: 'center' },
  chip: { minHeight: 40, paddingHorizontal: space.md, borderRadius: 20, justifyContent: 'center', backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line },
  chipActive: { backgroundColor: colors.volt, borderColor: colors.volt },
  chipText: { fontFamily: fonts.label, fontSize: 15, color: colors.ink2 },
  chipTextActive: { color: colors.voltInk },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  empty: { paddingVertical: space.xl, gap: space.sm, alignItems: 'center' },
  center: { textAlign: 'center' },
  // Stretched, because Android clips a centered heading's second word when it measures it shrink-wrapped.
  emptyTitle: { alignSelf: 'stretch', textAlign: 'center' },
  loading: { marginVertical: space.xl },
  segments: { flexDirection: 'row', gap: 3 },
  segment: { flex: 1, height: 10, backgroundColor: colors.surface2, transform: [{ skewX: '-18deg' }] },
  segmentDone: { backgroundColor: colors.volt },
});
