import { supersetGroups, type Linkable } from '@sandbag/shared';
import { Fragment, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, space } from '@/theme';
import { Icon } from './icons';
import { feel } from './motion';

/**
 * Lifts in the order they're done, with each superset held together by a line down its side.
 * With onLink, the gap between two lifts links or splits them, and `at` is the place of the first of the two.
 */
export function SupersetList<T extends Linkable>({ items, keyOf, onLink, children }: {
  items: readonly T[];
  keyOf: (item: T) => string;
  onLink?: (at: number, on: boolean) => void;
  children: (item: T) => ReactNode;
}) {
  const groups = supersetGroups(items);
  const gap = (item: T, linked: boolean) => (onLink ? <LinkGap linked={linked} onPress={() => onLink(items.indexOf(item), !linked)} /> : null);
  return groups.map((group, place) => {
    const last = group.at(-1)!;
    const lifts = group.map((item) => (
      <Fragment key={keyOf(item)}>
        {children(item)}
        {item === last ? null : gap(item, true)}
      </Fragment>
    ));
    return (
      <Fragment key={keyOf(group[0]!)}>
        {group.length < 2 ? lifts : (
          <View accessibilityLabel={`Superset of ${group.length}`} style={styles.group}>
            <Text style={styles.label}>SUPERSET</Text>
            {lifts}
          </View>
        )}
        {place < groups.length - 1 ? gap(last, false) : null}
      </Fragment>
    );
  });
}

/** The space between two lifts, which is where they're linked or split. */
function LinkGap({ linked, onPress }: { linked: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={linked ? 'Split this superset' : 'Superset these two'}
      hitSlop={4}
      onPress={() => {
        feel.tap();
        onPress();
      }}
      style={styles.gap}
    >
      <Icon name="link" size={14} color={linked ? colors.volt : colors.ink3} />
      <Text style={[styles.gapText, linked && styles.gapLinked]}>{linked ? 'LINKED' : 'SUPERSET'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  group: { gap: space.sm, paddingLeft: space.sm, borderLeftWidth: 3, borderColor: colors.volt },
  label: { fontFamily: fonts.label, fontSize: 12, letterSpacing: 1, color: colors.volt },
  gap: { flexDirection: 'row', alignSelf: 'center', alignItems: 'center', gap: space.xs, minHeight: 32, paddingHorizontal: space.md },
  gapText: { fontFamily: fonts.label, fontSize: 12, letterSpacing: 1, color: colors.ink3 },
  gapLinked: { color: colors.volt },
});
