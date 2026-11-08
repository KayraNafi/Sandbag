import { CALL_POINTS, MAX_WEEK_BONUS, MAX_WEEK_DISTANCE_POINTS, MAX_WEEK_PACE_POINTS, MAX_WEEKLY_CALL_POINTS, WEEKS_PER_SHIELD } from '@sandbag/shared';
import { StyleSheet, Text, View } from 'react-native';
import { Card, Heading, Muted, Screen } from '@/components/ui';
import { signedPoints } from '@/domain/format';
import { colors, fonts, space } from '@/theme';

/** The rules, one idea a line, so the score can be checked by hand. */
const SECTIONS: { title: string; note?: string; lines: string[] }[] = [
  {
    title: 'Progress',
    note: 'Half your score, out of 100',
    lines: [
      'How much stronger you got on the lifts you did, using weight and reps.',
      'Measured against your best of the four weeks before.',
      'Small gains count for plenty. +25% is full marks.',
    ],
  },
  {
    title: 'Consistency',
    note: 'The other half, out of 100',
    lines: [
      'Days trained against your weekly goal, counted as at least 3.',
      'The week runs Monday to Sunday.',
      'Heavier friends get no head start.',
    ],
  },
  {
    title: 'Bonuses',
    note: `This week, up to ${MAX_WEEK_BONUS}`,
    lines: [
      'A streak of 2 weeks or more.',
      'Coming back after a missed week.',
      'Training a day more than your goal.',
      '+2 for each lift past its best, up to 3.',
      `Every ${WEEKS_PER_SHIELD} weeks on target earns a shield that saves a streak from one missed week.`,
    ],
  },
  {
    title: 'Running',
    note: 'No goal and no streak: it pays whenever you run',
    lines: [
      `A point for every km run and half for every km walked, up to ${MAX_WEEK_DISTANCE_POINTS} a week.`,
      `Runs of 2 km or more also pay for pace, as the 5k time they're worth: under 20:00 is 10, then 8, 6, 4 and 2 for every 2½ minutes slower, up to ${MAX_WEEK_PACE_POINTS} a week.`,
      'Walks pay distance only.',
    ],
  },
  {
    title: 'Calls',
    note: `On top, up to ${MAX_WEEKLY_CALL_POINTS} either way a week`,
    lines: [
      `${signedPoints(CALL_POINTS.cleared.target)} for beating a call on you, ${signedPoints(CALL_POINTS.failed.target)} for failing it.`,
      `Double for getting caught: ${signedPoints(CALL_POINTS.caught.target)}.`,
      `${signedPoints(CALL_POINTS.cleared.caller)} for calling someone wrong.`,
      'Counted in the period the call settles.',
    ],
  },
  {
    title: 'All time',
    lines: ['Every week’s score added up since your first workout, bonuses, distance and calls included.'],
  },
];

export default function Scoring() {
  return (
    <Screen padTop={false}>
      <Muted>Your points are the average of two scores out of 100, progress and consistency. Bonuses, running and calls go on top.</Muted>
      {SECTIONS.map((section) => (
        <Card key={section.title}>
          <Heading>{section.title}</Heading>
          {section.note ? <Text style={styles.note}>{section.note}</Text> : null}
          <View style={styles.lines}>
            {section.lines.map((line) => (
              <View key={line} style={styles.line}>
                <View style={styles.dot} />
                <Text style={styles.text}>{line}</Text>
              </View>
            ))}
          </View>
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  note: { fontFamily: fonts.label, fontSize: 13, letterSpacing: 1, color: colors.volt, textTransform: 'uppercase' },
  lines: { gap: space.sm, marginTop: space.xs },
  line: { flexDirection: 'row', gap: space.sm },
  dot: { width: 5, height: 5, borderRadius: 3, marginTop: 8, backgroundColor: colors.ink3 },
  text: { flex: 1, fontFamily: fonts.body, fontSize: 15, lineHeight: 21, color: colors.ink2 },
});
