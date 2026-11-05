import { Children, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator, Animated, Keyboard, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View,
  type PressableProps, type StyleProp, type TextInputProps, type TextProps, type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { voice } from '@sandbag/shared';
import { Icon, type IconName } from '@/components/icons';
import { EASE_OUT, feel, NATIVE, prefersLessMotion } from '@/components/motion';
import { toast } from '@/components/Toast';
import { isOverMax, parseNumber } from '@/domain/format';
import { colors, fonts, radius, space } from '@/theme';

/**
 * How far the keyboard reaches up the screen. Android draws edge-to-edge, so the
 * window doesn't shrink for the keyboard, and its reported height leaves out the
 * navigation bar that the keyboard also covers.
 */
function useKeyboardHeight(bottomInset: number): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const show = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', (event) => {
      setHeight(event.endCoordinates.height + (Platform.OS === 'android' ? bottomInset : 0));
    });
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, [bottomInset]);
  return height;
}

export function Screen({ children, onRefresh, footer, padTop = true }: {
  children: ReactNode;
  onRefresh?: () => Promise<unknown>;
  footer?: ReactNode;
  padTop?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardHeight(insets.bottom);
  const [refreshing, setRefreshing] = useState(false);
  const refresh = onRefresh && (async () => {
    setRefreshing(true);
    await onRefresh().catch(() => {});
    setRefreshing(false);
  });
  return (
    // The list starts below the status bar, so nothing scrolls up underneath the clock.
    <View style={[styles.screen, { paddingTop: padTop ? insets.top : 0, paddingBottom: keyboard }]}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.scroll, { paddingTop: space.md }]}
        {...(refresh ? { refreshControl: <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.volt} /> } : {})}
      >
        {children}
      </ScrollView>
      {footer ? <View style={[styles.footer, { paddingBottom: keyboard ? space.md : insets.bottom + space.md }]}>{footer}</View> : null}
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
export function NumberField({ label, value, onChange, max, unit, decimals = true, style }: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  max: number;
  unit?: string;
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
          if (isOverMax(next, max)) {
            setText(String(max));
            onChange(max);
            toast(voice.overLimit(unit ? `${max} ${unit}` : String(max)));
            return;
          }
          setText(next);
          onChange(parseNumber(next, max));
        }}
        style={styles.numberInput}
      />
    </View>
  );
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

/** One choice of a few, with the highlight sliding to it. */
export function Segmented<T extends string>({ options, value, onChange }: { options: { key: T; label: string }[]; value: T; onChange: (key: T) => void }) {
  const [width, setWidth] = useState(0);
  const at = Math.max(0, options.findIndex((option) => option.key === value));
  const cell = width / options.length;
  const x = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (prefersLessMotion()) x.setValue(at * cell);
    else Animated.timing(x, { toValue: at * cell, duration: 240, easing: EASE_OUT, useNativeDriver: NATIVE }).start();
  }, [at, cell, x]);
  return (
    <View accessibilityRole="tablist" onLayout={(event) => setWidth(event.nativeEvent.layout.width)} style={styles.segmented}>
      {width ? <Animated.View style={[styles.thumb, { width: cell, transform: [{ translateX: x }] }]} /> : null}
      {options.map((option) => (
        <Pressable
          key={option.key}
          accessibilityRole="tab"
          accessibilityState={{ selected: option.key === value }}
          onPress={() => {
            feel.tap();
            onChange(option.key);
          }}
          style={styles.segmentedItem}
        >
          <Text numberOfLines={1} style={[styles.segmentedText, option.key === value && styles.segmentedTextOn]}>{option.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** One row of a settings-style list: an icon, what it is, and a chevron when it goes somewhere. */
export function ListRow({ icon, title, body, onPress, danger }: { icon?: IconName; title: string; body?: string; onPress?: () => void; danger?: boolean }) {
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={title}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.listRow, pressed && styles.listPressed]}
    >
      {icon ? <Icon name={icon} size={22} color={danger ? colors.danger : colors.volt} /> : null}
      <View style={styles.listText}>
        <Text style={[styles.listTitle, danger && styles.listDanger]}>{title}</Text>
        {body ? <Text style={styles.muted}>{body}</Text> : null}
      </View>
      {onPress ? <Icon name="chevron" size={18} color={colors.ink3} /> : null}
    </Pressable>
  );
}

/** Rows grouped on one surface, the way settings look on a phone. */
export const ListGroup = ({ children }: { children: ReactNode }) => <View style={styles.listGroup}>{children}</View>;

export const Row = ({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) => <View style={[styles.row, style]}>{children}</View>;

export function MoveButtons({ name, index, total, onMove }: { name: string; index: number; total: number; onMove: (delta: -1 | 1) => void }) {
  const first = index === 0;
  const last = index === total - 1;
  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel={`Move ${name} up`} disabled={first} onPress={() => onMove(-1)} style={[styles.move, first && styles.moveOff]}><Text style={styles.moveText}>↑</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`Move ${name} down`} disabled={last} onPress={() => onMove(1)} style={[styles.move, last && styles.moveOff]}><Text style={styles.moveText}>↓</Text></Pressable>
    </>
  );
}

export function Empty({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.empty}>
      <Heading style={styles.emptyTitle}>{title}</Heading>
      <Muted style={styles.center}>{body}</Muted>
    </View>
  );
}

/** Long lists arrive a page at a time, so a year of sessions doesn't all draw at once. */
export function useShowMore(total: number, page = 30) {
  const [shown, setShown] = useState(page);
  return { shown, left: Math.max(0, total - shown), more: () => setShown((current) => current + page), page };
}

export function ShowMore({ left, page, onPress }: { left: number; page: number; onPress: () => void }) {
  if (left <= 0) return null;
  return <Button title={`Show ${Math.min(left, page)} more`} variant="ghost" onPress={onPress} />;
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
  listGroup: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, overflow: 'hidden' },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 56, paddingVertical: space.md, paddingHorizontal: space.lg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  listPressed: { backgroundColor: colors.surface2 },
  listText: { flex: 1, gap: 2 },
  listTitle: { fontFamily: fonts.bodyStrong, fontSize: 17, color: colors.ink },
  listDanger: { color: colors.danger },
  segmented: { flexDirection: 'row', height: 48, borderRadius: 24, backgroundColor: colors.surface2, overflow: 'hidden' },
  thumb: { position: 'absolute', top: 0, bottom: 0, left: 0, borderRadius: 24, backgroundColor: colors.volt },
  segmentedItem: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  segmentedText: { fontFamily: fonts.label, fontSize: 15, color: colors.ink2 },
  segmentedTextOn: { color: colors.voltInk },
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: space.lg, paddingBottom: 48, gap: space.md, width: '100%', maxWidth: 640, alignSelf: 'center' },
  footer: { paddingHorizontal: space.lg, paddingTop: space.md, backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: colors.line, gap: space.sm },
  title: { fontFamily: fonts.display, fontSize: 40, lineHeight: 42, color: colors.ink },
  heading: { fontFamily: fonts.display, fontSize: 24, lineHeight: 28, color: colors.ink },
  label: { fontFamily: fonts.label, fontSize: 13, letterSpacing: 1, color: colors.ink3 },
  body: { fontFamily: fonts.body, fontSize: 17, lineHeight: 24, color: colors.ink },
  muted: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21, color: colors.ink2 },
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
  chip: { minHeight: 44, paddingHorizontal: space.md, borderRadius: 22, justifyContent: 'center', backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line },
  chipActive: { backgroundColor: colors.volt, borderColor: colors.volt },
  chipText: { fontFamily: fonts.label, fontSize: 15, color: colors.ink2 },
  chipTextActive: { color: colors.voltInk },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  move: { width: 44, height: 44, borderRadius: 10, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  moveOff: { opacity: 0.3 },
  moveText: { color: colors.ink, fontSize: 18 },
  empty: { paddingVertical: space.xl, gap: space.sm, alignItems: 'center' },
  center: { textAlign: 'center' },
  // Stretched, because Android clips a centered heading's second word when it measures it shrink-wrapped.
  emptyTitle: { alignSelf: 'stretch', textAlign: 'center' },
  loading: { marginVertical: space.xl },
  segments: { flexDirection: 'row', gap: 3 },
  segment: { flex: 1, height: 10, backgroundColor: colors.surface2, transform: [{ skewX: '-18deg' }] },
  segmentDone: { backgroundColor: colors.volt },
});
