import { voice } from '@sandbag/shared';
import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon } from '@/components/icons';
import { feel, usePulse } from '@/components/motion';
import { toast } from '@/components/Toast';
import { NumberField, NumberInput, Row } from '@/components/ui';
import { nudge, num } from '@/domain/format';
import { colors, fonts, radius, space } from '@/theme';

/** How often a held button repeats. */
const REPEAT_MS = 130;

/**
 * A number with − and + either side. Hold a button and it keeps going; tap the number to type one.
 * `row` sits in a form, `large` stands alone, and `compact` is half a screen wide with the buttons below.
 */
export function Stepper({ label, value, step, max, unit, decimals = true, variant = 'row', onStepPress, onChange }: {
  label: string;
  value: number | null;
  step: number;
  max: number;
  unit?: string;
  decimals?: boolean;
  variant?: 'row' | 'large' | 'compact';
  /** Offers to change what the buttons move by, for a gym that can't do the usual step. */
  onStepPress?: () => void;
  onChange: (value: number | null) => void;
}) {
  const kick = usePulse(value);
  // Read fresh on every repeat, since holding a button keeps firing long after this render.
  const latest = useRef({ value, onChange });
  latest.current = { value, onChange };
  const repeat = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopRepeat = () => {
    if (repeat.current) clearInterval(repeat.current);
    repeat.current = null;
  };
  useEffect(() => stopRepeat, []);

  const move = (delta: number) => {
    feel.tap();
    const next = nudge(latest.current.value ?? 0, delta);
    if (next > max) {
      stopRepeat();
      toast(voice.overLimit(unit ? `${max} ${unit}` : String(max)));
    }
    latest.current.onChange(Math.min(next, max));
  };
  // "Weight, kg" is read out as "Lower weight by 2.5".
  const name = label.split(',')[0]!.toLowerCase();
  const button = (delta: number, sign: string, verb: string, style: object) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${verb} ${name} by ${num(step)}`}
      onPress={() => move(delta)}
      onLongPress={() => {
        stopRepeat();
        repeat.current = setInterval(() => move(delta), REPEAT_MS);
      }}
      onPressOut={stopRepeat}
      style={({ pressed }) => [style, pressed && styles.pressed]}
    >
      <Text style={variant === 'row' ? styles.rowSign : styles.sign}>{sign}</Text>
    </Pressable>
  );
  const field = { label, value, max, unit, decimals, onChange };

  if (variant === 'row') {
    return (
      <Row style={styles.row}>
        {button(-step, '−', 'Lower', styles.rowButton)}
        <NumberField {...field} />
        {button(step, '+', 'Raise', styles.rowButton)}
      </Row>
    );
  }
  if (variant === 'compact') {
    const caption = (unit ?? label).toUpperCase();
    return (
      <View style={styles.stepper}>
        <Animated.View style={[styles.value, { transform: [{ scale: kick }] }]}>
          <NumberInput {...field} style={[styles.input, styles.inputCompact]} />
          {onStepPress ? (
            <Pressable accessibilityRole="button" accessibilityLabel={`Change the ${name} jump, now ${num(step)}`} hitSlop={8} onPress={onStepPress} style={styles.caption}>
              <Text style={styles.unit}>{caption}</Text>
              <Text style={styles.jump}>JUMPS OF {num(step)}</Text>
              <Icon name="chevron" size={12} color={colors.volt} />
            </Pressable>
          ) : <View style={styles.caption}><Text style={styles.unit}>{caption}</Text></View>}
        </Animated.View>
        <View style={styles.buttons}>
          {button(-step, '−', 'Lower', styles.compactButton)}
          {button(step, '+', 'Raise', styles.compactButton)}
        </View>
      </View>
    );
  }
  return (
    <View style={styles.stepper}>
      <Text style={styles.label}>{label.toUpperCase()}</Text>
      <View style={styles.buttons}>
        {button(-step, '−', 'Lower', styles.largeButton)}
        <Animated.View style={[styles.value, { transform: [{ scale: kick }] }]}>
          <NumberInput {...field} style={styles.input} />
          {unit ? <Text style={styles.unit}>{unit}</Text> : null}
        </Animated.View>
        {button(step, '+', 'Raise', styles.largeButton)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.7, transform: [{ scale: 0.97 }] },
  row: { alignItems: 'flex-end' },
  rowButton: { width: 56, height: 50, borderRadius: radius.md, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  rowSign: { fontFamily: fonts.display, fontSize: 28, color: colors.volt },
  stepper: { gap: space.sm },
  label: { fontFamily: fonts.label, fontSize: 13, letterSpacing: 1, color: colors.ink3, textAlign: 'center' },
  buttons: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  largeButton: { width: 72, height: 72, borderRadius: radius.lg, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  compactButton: { flex: 1, height: 64, borderRadius: radius.lg, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  sign: { fontFamily: fonts.display, fontSize: 40, lineHeight: 44, color: colors.volt },
  value: { flex: 1, alignItems: 'center' },
  input: { width: '100%', fontFamily: fonts.display, fontSize: 56, lineHeight: 64, color: colors.ink, textAlign: 'center', padding: 0 },
  inputCompact: { fontSize: 72, lineHeight: 74 },
  caption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs, minHeight: 44 },
  unit: { fontFamily: fonts.label, fontSize: 15, letterSpacing: 1, color: colors.ink3 },
  jump: { fontFamily: fonts.label, fontSize: 15, letterSpacing: 1, color: colors.volt },
});
