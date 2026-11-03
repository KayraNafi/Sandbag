import { catalogEntry } from '@sandbag/shared';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatDate } from '@/domain/format';
import { colors, fonts, radius, space } from '@/theme';
import { EquipmentIcon, Icon } from './icons';
import { FadeIn, feel } from './motion';

/** One lift: what it's done on, what it is, and the number you came to see. */
export function LiftRow({ name, detail, value, unit = 'KG', onPress, delay = 0 }: {
  name: string;
  detail?: string | undefined;
  value?: string | null | undefined;
  unit?: string;
  onPress?: () => void;
  delay?: number;
}) {
  const equipment = catalogEntry(name)?.equipment;
  return (
    <FadeIn delay={delay}>
      <Pressable
        accessibilityRole={onPress ? 'button' : undefined}
        accessibilityLabel={`${name}${value ? `, ${value} ${unit}` : ''}${detail ? `, ${detail}` : ''}`}
        disabled={!onPress}
        onPress={() => {
          feel.tap();
          onPress?.();
        }}
        style={styles.lift}
      >
        <View style={styles.icon}>{equipment ? <EquipmentIcon type={equipment} size={28} color={colors.volt} /> : <Icon name="plus" size={20} color={colors.ink3} />}</View>
        <View style={styles.middle}>
          <Text numberOfLines={1} style={styles.name}>{name}</Text>
          {detail ? <Text numberOfLines={2} style={styles.detail}>{detail}</Text> : null}
        </View>
        {value ? (
          <View style={styles.value}>
            <Text style={styles.number}>{value}</Text>
            <Text style={styles.unit}>{unit}</Text>
          </View>
        ) : null}
      </Pressable>
    </FadeIn>
  );
}

/** A session on the calendar: the date big enough to find, and whatever else belongs beside it. */
export function SessionRow({ date, title, detail, right, onPress, delay = 0 }: {
  date: string;
  title: string;
  detail: string;
  right?: ReactNode;
  onPress: () => void;
  delay?: number;
}) {
  const [day, month] = formatDate(date).split(' ');
  return (
    <FadeIn delay={delay}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title}, ${formatDate(date)}, ${detail}`}
        onPress={() => {
          feel.tap();
          onPress();
        }}
        style={styles.session}
      >
        <View style={styles.date}>
          <Text style={styles.day}>{day}</Text>
          <Text style={styles.month}>{month?.toUpperCase()}</Text>
        </View>
        <View style={styles.middle}>
          <Text numberOfLines={1} style={styles.title}>{title.toUpperCase()}</Text>
          <Text numberOfLines={1} style={styles.detail}>{detail}</Text>
        </View>
        {right}
      </Pressable>
    </FadeIn>
  );
}

const styles = StyleSheet.create({
  lift: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 64, paddingVertical: space.sm },
  icon: { width: 32, alignItems: 'center' },
  middle: { flex: 1, gap: 2 },
  name: { fontFamily: fonts.bodyStrong, fontSize: 17, color: colors.ink },
  detail: { fontFamily: fonts.body, fontSize: 15, lineHeight: 19, color: colors.ink3 },
  value: { flexDirection: 'row', alignItems: 'baseline', gap: 3 },
  number: { fontFamily: fonts.display, fontSize: 34, lineHeight: 36, color: colors.ink },
  unit: { fontFamily: fonts.label, fontSize: 12, letterSpacing: 1, color: colors.ink3 },
  session: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 72, padding: space.sm, borderRadius: radius.lg, backgroundColor: colors.surface },
  date: { width: 52, height: 56, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: colors.surface2 },
  day: { fontFamily: fonts.display, fontSize: 28, lineHeight: 28, color: colors.volt },
  month: { fontFamily: fonts.label, fontSize: 11, letterSpacing: 1, color: colors.ink3 },
  title: { fontFamily: fonts.display, fontSize: 20, lineHeight: 26, color: colors.ink },
});
