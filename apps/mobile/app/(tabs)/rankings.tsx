import type { Period, RankingRow } from '@sandbag/shared';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { api } from '@/api/client';
import { useSession } from '@/auth/session';
import { Button, Card, Chip, Empty, Label, Loading, Muted, Row, Screen, Title } from '@/components/ui';
import { signed } from '@/domain/format';
import { Avatar } from '@/components/Avatar';
import { colors, fonts, space } from '@/theme';

function gapLine(rows: RankingRow[], myId: string | undefined): string | null {
  const mine = rows.find((row) => row.user.id === myId);
  if (!mine || rows.length < 2) return null;
  const above = rows[rows.indexOf(mine) - 1];
  if (!above) return 'You’re in front. Enjoy it, they can see this too.';
  const gap = above.score - mine.score;
  return gap ? `${gap} ${gap === 1 ? 'point' : 'points'} behind ${above.user.displayName}. Not that anyone’s counting.` : `Level with ${above.user.displayName}. Awkward.`;
}

export default function Rankings() {
  const [period, setPeriod] = useState<Period>('week');
  const me = useSession((state) => state.me);
  const rankings = useQuery({ queryKey: ['rankings', period], queryFn: () => api.rankings(period) });
  const rows = rankings.data ?? [];
  const gap = gapLine(rows, me?.id);

  return (
    <Screen onRefresh={() => rankings.refetch()}>
      <Title>Rankings</Title>
      <Row>
        <Chip title="This week" active={period === 'week'} onPress={() => setPeriod('week')} />
        <Chip title="This month" active={period === 'month'} onPress={() => setPeriod('month')} />
      </Row>
      {gap ? <Muted>{gap}</Muted> : null}
      {rankings.isPending ? <Loading /> : null}
      {rankings.isError ? <Muted>Can’t load rankings right now.</Muted> : null}
      {rows.map((row) => (
        <Card key={row.user.id} style={row.user.id === me?.id ? styles.mine : undefined}>
          <Row>
            <Text style={styles.rank}>{row.rank}</Text>
            <Avatar user={row.user} />
            <View style={styles.flex}>
              <Text style={styles.name}>{row.user.displayName}{row.wearingSandbag ? '  ' : ''}{row.wearingSandbag ? <Text style={styles.badge}>SANDBAG</Text> : null}</Text>
              <Muted>Progress {signed(row.progress)}</Muted>
              <Muted>{row.workouts} of {row.target} workouts</Muted>
              {row.streak ? <Muted>{row.streak} {row.streak === 1 ? 'week' : 'weeks'} on target</Muted> : null}
            </View>
            <View style={styles.scoreBox} accessibilityLabel={`${row.score} points`}>
              <Text style={styles.score}>{row.score}</Text>
              <Label style={styles.points}>pts</Label>
            </View>
          </Row>
        </Card>
      ))}
      {rankings.isSuccess && rows.length < 2 ? (
        <>
          <Empty title="You’re winning" body="Out of one. Add someone before this gets sad." />
          <Button title="Bring witnesses" onPress={() => router.push('/invites')} />
        </>
      ) : null}
      <Muted>
        Your points are the average of two scores out of 100. Progress: every +1% on your own lifts is 10 points, and each lift counts for 25% at most, up or down.
        Consistency: workouts done against your weekly target. Heavier friends get no head start.
      </Muted>
      <Button title="What’s sandbagging?" variant="ghost" onPress={() => router.push('/about')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  mine: { borderColor: colors.volt },
  rank: { fontFamily: fonts.display, fontSize: 28, color: colors.ink3, width: 28, textAlign: 'center' },
  name: { fontFamily: fonts.bodyStrong, fontSize: 16, color: colors.ink },
  badge: { fontFamily: fonts.label, fontSize: 12, letterSpacing: 1, color: colors.warn },
  scoreBox: { alignItems: 'flex-end', minWidth: 48, marginLeft: space.sm },
  score: { fontFamily: fonts.display, fontSize: 36, lineHeight: 38, color: colors.volt },
  points: { fontSize: 11 },
});
