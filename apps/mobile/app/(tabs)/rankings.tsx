import type { Period, RankingRow } from '@sandbag/shared';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { api } from '@/api/client';
import { useSession } from '@/auth/session';
import { Avatar } from '@/components/Avatar';
import { League } from '@/components/League';
import { CountUp, feel, GrowBar, GrowUp, Pop, Stamp } from '@/components/motion';
import { Sheet } from '@/components/Sheet';
import { Topics } from '@/components/Topics';
import { Button, Card, Empty, Loading, Muted, Row, Screen, Segmented, Title } from '@/components/ui';
import { plural, signed } from '@/domain/format';
import { colors, fonts, radius, space } from '@/theme';

type View_ = Period | 'season';

const VIEWS: { key: View_; label: string }[] = [
  { key: 'week', label: 'This week' },
  { key: 'month', label: '30 days' },
  { key: 'season', label: 'Season' },
];

/** The one person to catch, on one track. Being told a rank is nothing next to seeing the gap. */
function Chase({ rows, myId }: { rows: RankingRow[]; myId: string | undefined }) {
  const at = rows.findIndex((row) => row.user.id === myId);
  const mine = rows[at];
  if (!mine || rows.length < 2) return null;
  const above = rows[at - 1];
  const below = rows[at + 1];
  const rival = above ?? below;
  if (!rival) return null;
  const gap = Math.abs(rival.score - mine.score);
  return (
    <Card>
      <Row style={styles.chaseTop}>
        <CountUp value={gap} style={styles.chaseNumber} />
        <Text style={styles.chaseText}>
          {above ? (gap ? `TO CATCH ${above.user.displayName.toUpperCase()}` : `LEVEL WITH ${above.user.displayName.toUpperCase()}`) : `AHEAD OF ${rival.user.displayName.toUpperCase()}`}
        </Text>
      </Row>
      <Row>
        <Avatar user={mine.user} size={36} />
        <View style={styles.flex}><GrowBar ratio={above ? mine.score / Math.max(1, above.score) : 1} color={colors.volt} delay={200} height={12} /></View>
        <Avatar user={rival.user} size={36} />
      </Row>
      <Muted>{above ? (gap ? 'Not that anyone’s counting.' : 'Awkward.') : 'Enjoy it, they can see this too.'}</Muted>
    </Card>
  );
}

// Tallest in the middle, the way a real podium stands.
const PODIUM_ORDER = [1, 0, 2];
const PODIUM_HEIGHT = [120, 88, 64];

function Podium({ rows, onOpen }: { rows: RankingRow[]; onOpen: (row: RankingRow) => void }) {
  return (
    <View style={styles.podium}>
      {PODIUM_ORDER.map((place) => {
        const row = rows[place];
        if (!row) return <View key={place} style={styles.step} />;
        return (
          <Pressable key={row.user.id} accessibilityRole="button" accessibilityLabel={`${row.rank}. ${row.user.displayName}, ${row.score} points`} onPress={() => { feel.tap(); onOpen(row); }} style={styles.step}>
            <Avatar user={row.user} size={place === 0 ? 64 : 52} />
            <Text numberOfLines={1} style={styles.podiumName}>{row.user.displayName}</Text>
            {row.wearingSandbag ? <Stamp delay={500}><Text style={styles.badge}>SANDBAG</Text></Stamp> : null}
            <GrowUp height={PODIUM_HEIGHT[place]!} delay={place * 90} style={[styles.block, place === 0 && styles.blockFirst]}>
              <View style={styles.blockInner}>
                <CountUp value={row.score} delay={place * 90} style={[styles.podiumScore, place === 0 && styles.podiumScoreFirst]} />
                <Text style={[styles.podiumRank, place === 0 && styles.podiumRankFirst]}>{row.rank}</Text>
              </View>
            </GrowUp>
          </Pressable>
        );
      })}
    </View>
  );
}

const FULL_DAYS = 4;
const FULL_PROGRESS = 25;

/** How the score was made: two things you did, then whatever you earned on top. */
function Breakdown({ row }: { row: RankingRow }) {
  const bonuses = row.bonuses;
  const extras: [string, number][] = bonuses ? [
    [`${row.streak}-week streak`, bonuses.streak],
    ['Back after a miss', bonuses.comeback],
    ['New bests', bonuses.newBest],
    ['Beat the goal', bonuses.perfect],
    ['Whole crew hit their goals', bonuses.crew],
    ['Sandbag calls', bonuses.calls],
  ] : [];
  return (
    <>
      <Row style={styles.scoreRow}>
        <CountUp value={row.score} style={styles.sheetScore} />
        <Text style={styles.sheetOf}>POINTS{'\n'}{row.base} FROM TRAINING</Text>
      </Row>
      {row.wearingSandbag ? <Muted>Wearing the sandbag: a call on them failed in the last week.</Muted> : null}

      <View style={styles.meter}>
        <Row style={styles.meterTop}><Text style={styles.meterName}>Got stronger</Text><Text style={styles.meterValue}>{signed(row.progress)}</Text></Row>
        <GrowBar ratio={row.progress / FULL_PROGRESS} color={colors.volt} delay={150} height={12} />
      </View>

      <View style={styles.meter}>
        <Row style={styles.meterTop}><Text style={styles.meterName}>Days trained</Text><Text style={styles.meterValue}>{row.workouts}</Text></Row>
        <Row style={styles.days}>
          {Array.from({ length: Math.max(FULL_DAYS, row.workouts) }, (_, day) => (
            <Pop key={day} delay={250 + day * 90} style={styles.flex}>
              <View style={[styles.day, day < row.workouts && styles.dayOn]} />
            </Pop>
          ))}
        </Row>
      </View>

      {extras.filter(([, value]) => value).map(([label, value], index) => (
        <Pop key={label} delay={500 + index * 110}>
          <Row style={styles.extra}>
            <Text style={styles.extraName}>{label}</Text>
            <Text style={[styles.extraValue, value < 0 && styles.extraDown]}>{plus(value)}</Text>
          </Row>
        </Pop>
      ))}
      {row.streak ? <Muted>{plural(row.streak, 'week')} on target{row.shields ? `, with ${plural(row.shields, 'shield')} in hand` : ''}. Goal: {plural(row.target, 'day')} a week.</Muted> : null}
    </>
  );
}

const plus = (value: number) => (value > 0 ? `+${value}` : value < 0 ? `−${Math.abs(value)}` : '0');

export default function Rankings() {
  const [view, setView] = useState<View_>('week');
  const [open, setOpen] = useState<RankingRow | null>(null);
  const [rules, setRules] = useState(false);
  const me = useSession((state) => state.me);
  const period: Period = view === 'month' ? 'month' : 'week';
  const rankings = useQuery({ queryKey: ['rankings', period], queryFn: () => api.rankings(period) });
  const rows = rankings.data ?? [];
  const top = Math.max(1, rows[0]?.score ?? 1);
  const rest = rows.length >= 2 ? rows.slice(3) : rows;

  return (
    <Screen onRefresh={() => rankings.refetch()}>
      <Row style={styles.top}>
        <Title>Rankings</Title>
        <Pressable accessibilityRole="button" onPress={() => setRules(true)} hitSlop={8} style={styles.how}><Text style={styles.howText}>How it works</Text></Pressable>
      </Row>
      <Segmented options={VIEWS} value={view} onChange={setView} />

      {view === 'season' ? <League /> : (
        <>
          {rankings.isPending ? <Loading /> : null}
          {rankings.isError ? (
            <>
              <Muted>Can’t load rankings right now.</Muted>
              <Button title="Try again" variant="ghost" onPress={() => rankings.refetch()} />
            </>
          ) : null}
          {rows.length >= 2 ? <Podium rows={rows} onOpen={setOpen} /> : null}
          <Chase rows={rows} myId={me?.id} />
          {rest.map((row, index) => (
            <Pressable
              key={row.user.id}
              accessibilityRole="button"
              accessibilityLabel={`${row.rank}. ${row.user.displayName}, ${row.score} points`}
              onPress={() => { feel.tap(); setOpen(row); }}
              style={styles.racer}
            >
              <Text style={styles.rank}>{row.rank}</Text>
              <Avatar user={row.user} size={40} />
              <View style={styles.racerMiddle}>
                <Row style={styles.racerName}>
                  <Text numberOfLines={1} style={[styles.name, styles.flex]}>{row.user.displayName}</Text>
                  {row.wearingSandbag ? <Text style={styles.badge}>SANDBAG</Text> : null}
                </Row>
                <GrowBar ratio={row.score / top} color={row.user.id === me?.id ? colors.volt : colors.ink3} delay={120 + index * 70} />
              </View>
              <CountUp value={row.score} delay={120 + index * 70} style={[styles.score, row.user.id === me?.id && styles.scoreMine]} />
            </Pressable>
          ))}
          {rankings.isSuccess && rows.length < 2 ? (
            <>
              <Empty title="You’re winning" body="Out of one. Add someone before this gets sad." />
              <Button title="Bring witnesses" onPress={() => router.push('/invites')} />
            </>
          ) : null}
        </>
      )}

      <Sheet visible={Boolean(open)} onClose={() => setOpen(null)} title={open?.user.displayName ?? ''}>
        {open ? <Breakdown row={open} /> : null}
      </Sheet>

      <Sheet visible={rules} onClose={() => setRules(false)} title="How it works" footer={<Button title="What’s sandbagging?" variant="ghost" onPress={() => { setRules(false); router.push('/about'); }} />}>
        <Topics items={[
          { title: 'Your week’s score', body: 'Half is how much stronger you got against your own recent best, so heavier friends get no head start. Half is days trained: four a week is full marks.' },
          { title: 'Bonuses', body: 'Streaks, new bests, coming back after a miss, beating your goal and your whole crew hitting theirs add a little on top. Never enough to beat actually training.' },
          { title: 'Streaks', body: 'Hit your goal for the week and it grows. Every 4 weeks earns a shield, which saves you once. No shield and it’s back to zero.' },
          { title: 'Seasons', body: 'In a crew, you play someone new each week. Win and your rating rises, more for beating someone above you. A week of nothing costs rating too. After 8 weeks there’s a champion and everyone starts level.' },
        ]} />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  top: { justifyContent: 'space-between' },
  how: { minHeight: 44, justifyContent: 'center' },
  howText: { fontFamily: fonts.bodyStrong, fontSize: 15, color: colors.volt },
  chaseTop: { alignItems: 'flex-end', gap: space.sm },
  chaseNumber: { fontFamily: fonts.display, fontSize: 56, lineHeight: 60, color: colors.volt },
  chaseText: { flex: 1, fontFamily: fonts.label, fontSize: 15, letterSpacing: 1, color: colors.ink, marginBottom: space.sm },
  racer: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 60 },
  racerMiddle: { flex: 1, gap: 6 },
  racerName: { gap: space.xs },
  rank: { fontFamily: fonts.display, fontSize: 24, color: colors.ink3, width: 24, textAlign: 'center' },
  name: { fontFamily: fonts.bodyStrong, fontSize: 17, color: colors.ink },
  badge: { fontFamily: fonts.display, fontSize: 13, letterSpacing: 1, color: colors.warn },
  score: { fontFamily: fonts.display, fontSize: 28, lineHeight: 34, color: colors.ink, minWidth: 44, textAlign: 'right' },
  scoreMine: { color: colors.volt },
  podium: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm, marginTop: space.md },
  step: { flex: 1, alignItems: 'center', gap: space.xs },
  podiumName: { fontFamily: fonts.bodyStrong, fontSize: 15, color: colors.ink, maxWidth: '100%' },
  block: { alignSelf: 'stretch', backgroundColor: colors.surface2, borderTopLeftRadius: radius.md, borderTopRightRadius: radius.md },
  blockFirst: { backgroundColor: colors.volt },
  blockInner: { alignItems: 'center', paddingTop: space.sm },
  podiumScore: { fontFamily: fonts.display, fontSize: 34, lineHeight: 38, color: colors.ink },
  podiumScoreFirst: { color: colors.voltInk, fontSize: 40, lineHeight: 48 },
  podiumRank: { fontFamily: fonts.label, fontSize: 13, color: colors.ink3 },
  podiumRankFirst: { color: colors.voltInk },
  scoreRow: { alignItems: 'flex-end', gap: space.md },
  sheetScore: { fontFamily: fonts.display, fontSize: 72, lineHeight: 88, color: colors.volt },
  sheetOf: { fontFamily: fonts.label, fontSize: 13, lineHeight: 17, letterSpacing: 1, color: colors.ink3, marginBottom: space.md },
  meter: { gap: space.xs },
  meterTop: { justifyContent: 'space-between' },
  meterName: { fontFamily: fonts.bodyStrong, fontSize: 15, color: colors.ink },
  meterValue: { fontFamily: fonts.display, fontSize: 20, color: colors.ink },
  days: { gap: 4 },
  day: { height: 12, backgroundColor: colors.surface2, transform: [{ skewX: '-18deg' }] },
  dayOn: { backgroundColor: colors.volt },
  extra: { justifyContent: 'space-between', minHeight: 44, paddingHorizontal: space.md, borderRadius: radius.md, backgroundColor: colors.surface2 },
  extraName: { flex: 1, fontFamily: fonts.body, fontSize: 15, color: colors.ink },
  extraValue: { fontFamily: fonts.display, fontSize: 24, color: colors.volt },
  extraDown: { color: colors.danger },
});
