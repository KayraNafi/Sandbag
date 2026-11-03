import { voice, type CallView, type SavedWorkout } from '@sandbag/shared';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { api } from '@/api/client';
import { useSession } from '@/auth/session';
import { Button, Card, Heading, Label, Muted, Row, Screen, Title } from '@/components/ui';
import { moveSaved, startBlank, startFromSaved } from '@/data/actions';
import { useData } from '@/data/store';
import { syncNow } from '@/data/sync';
import { agoLong, agoText, formatDate, num, plural, today } from '@/domain/format';
import { activeLogged, activeSaved, nextWorkout } from '@/domain/history';
import { colors, fonts, space } from '@/theme';

const QUIET_DAYS = 5;
const MY_CALLS_SHOWN = 5;
const VERDICT: Record<CallView['status'], string> = {
  open: 'Waiting on their next session of it',
  cleared: 'They beat it. Call answered.',
  failed: 'Sandbag confirmed. You were right.',
};

function start(workout: SavedWorkout) {
  startFromSaved(workout);
  router.push('/workout/active');
}

export default function Train() {
  const logged = useData((state) => state.logged);
  const saved = useData((state) => state.saved);
  const draft = useData((state) => state.draft);
  const me = useSession((state) => state.me);
  const workouts = useMemo(() => activeLogged(logged), [logged]);
  const rotation = useMemo(() => activeSaved(saved), [saved]);
  const upNext = nextWorkout(rotation, workouts);
  const calls = useQuery({ queryKey: ['calls'], queryFn: api.calls });
  const notifications = useQuery({ queryKey: ['notifications'], queryFn: api.notifications });
  const unread = notifications.data?.filter((item) => !item.read).length ?? 0;
  const openOnMe = calls.data?.filter((call) => call.status === 'open' && call.target.id === me?.id) ?? [];
  const byMe = calls.data?.filter((call) => call.caller.id === me?.id).slice(0, MY_CALLS_SHOWN) ?? [];
  const last = workouts[0];
  const quietDays = last ? Math.round((Date.parse(today()) - Date.parse(last.date)) / 86_400_000) : 0;

  return (
    <Screen onRefresh={() => Promise.all([syncNow(), calls.refetch(), notifications.refetch()])}>
      <Row style={styles.top}>
        <Title style={styles.brand}>Sandbag</Title>
        <Pressable accessibilityRole="button" accessibilityLabel={`Notifications, ${unread} unread`} hitSlop={8} onPress={() => router.push('/notifications')} style={styles.bell}>
          <Text style={styles.bellText}>{unread ? `${unread} NEW` : 'INBOX'}</Text>
        </Pressable>
      </Row>
      {quietDays >= QUIET_DAYS ? <Muted>{voice.quiet(quietDays)}</Muted> : null}

      {draft ? (
        <Card style={styles.hero}>
          <Label style={styles.heroLabel}>In progress</Label>
          <Text style={styles.heroTitle}>{draft.title.toUpperCase()}</Text>
          <Text style={styles.heroBody}>{draft.entries.filter((entry) => entry.done).length} of {draft.entries.length} done</Text>
          <Button title="Back to it" variant="ghost" style={styles.heroButton} onPress={() => router.push('/workout/active')} />
        </Card>
      ) : upNext ? (
        <Card style={styles.hero}>
          <Label style={styles.heroLabel}>Up next</Label>
          <Text style={styles.heroTitle}>{upNext.name.toUpperCase()}</Text>
          <Text style={styles.heroBody}>{plural(upNext.exercises.length, 'exercise')}. Your numbers are loaded.</Text>
          <Button title="Start" variant="ghost" style={styles.heroButton} onPress={() => start(upNext)} />
        </Card>
      ) : (
        <Card style={styles.hero}>
          <Label style={styles.heroLabel}>First rep</Label>
          <Text style={styles.heroTitle}>SAVE A WORKOUT</Text>
          <Text style={styles.heroBody}>Put in your Upper and Lower once and never type them again.</Text>
          <Button title="Create workout" variant="ghost" style={styles.heroButton} onPress={() => router.push('/workout/edit/new')} />
        </Card>
      )}

      {openOnMe.map((call) => (
        <Card key={call.id} style={styles.call}>
          <Label style={styles.callLabel}>{call.caller.displayName} called sandbag</Label>
          <Text style={styles.callTitle}>{`${call.exercise}${call.targetWeight === null ? '' : `: beat ${num(call.targetWeight)} kg`}`.toUpperCase()}</Text>
          <Muted>“{call.line}” Your next session of this lift settles it.</Muted>
        </Card>
      ))}

      {byMe.length ? (
        <>
          <Heading style={styles.section}>Your calls</Heading>
          <Card>
            {byMe.map((call, index) => (
              <View key={call.id} style={[styles.myCall, index > 0 && styles.myCallDivider]}>
                <Text style={styles.name}>{call.target.displayName} · {call.exercise}{call.targetWeight === null ? '' : ` ${num(call.targetWeight)} kg`}</Text>
                <Text style={[styles.verdict, call.status === 'failed' && styles.verdictWon, call.status === 'cleared' && styles.verdictLost]}>{VERDICT[call.status]}</Text>
                <Muted>“{call.line}” · {agoLong(call.createdAt)}</Muted>
              </View>
            ))}
          </Card>
        </>
      ) : null}

      <Row style={styles.section}>
        <Heading>Your workouts</Heading>
        <Pressable accessibilityRole="button" hitSlop={8} onPress={() => router.push('/workout/edit/new')}>
          <Text style={styles.link}>+ New</Text>
        </Pressable>
      </Row>
      {rotation.length ? <Muted>They run in this order and loop. Use the arrows to reorder.</Muted> : null}
      {rotation.map((workout, index) => (
        <Card key={workout.id} label={`Open ${workout.name}`} onPress={() => router.push(`/workout/saved/${workout.id}`)}>
          <Row>
            <View style={styles.flex}>
              <Text style={styles.name}>{workout.name}</Text>
              <Muted>{plural(workout.exercises.length, 'exercise')}{workout.savedFrom ? ` · from ${workout.savedFrom}` : ''}</Muted>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={`Move ${workout.name} up`} disabled={index === 0} onPress={() => moveSaved(rotation, index, -1)} style={[styles.arrow, index === 0 && styles.arrowOff]}>
              <Text style={styles.arrowText}>↑</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={`Move ${workout.name} down`} disabled={index === rotation.length - 1} onPress={() => moveSaved(rotation, index, 1)} style={[styles.arrow, index === rotation.length - 1 && styles.arrowOff]}>
              <Text style={styles.arrowText}>↓</Text>
            </Pressable>
          </Row>
        </Card>
      ))}
      <Button title="Start empty" variant="ghost" onPress={() => {
        startBlank();
        router.push('/workout/active');
      }} />

      {workouts.length ? (
        <>
          <Row style={styles.section}>
            <Heading>Recent</Heading>
            <Pressable accessibilityRole="button" hitSlop={8} onPress={() => router.push('/history')}>
              <Text style={styles.link}>All history</Text>
            </Pressable>
          </Row>
          {workouts.slice(0, 3).map((workout) => (
            <Card key={workout.id} label={`Open ${workout.title}`} onPress={() => router.push(`/workout/logged/${workout.id}`)}>
              <Text style={styles.name}>{workout.title}</Text>
              <Muted>{formatDate(workout.date)} · {agoText(workout.date)} · {plural(workout.entries.length, 'exercise')}</Muted>
            </Card>
          ))}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  top: { justifyContent: 'space-between' },
  brand: { color: colors.volt, fontSize: 36, lineHeight: 40 },
  bell: { paddingHorizontal: space.md, minHeight: 40, justifyContent: 'center', borderWidth: 1, borderColor: colors.line, borderRadius: 20 },
  bellText: { fontFamily: fonts.label, fontSize: 13, letterSpacing: 1, color: colors.ink },
  hero: { backgroundColor: colors.volt, borderColor: colors.volt },
  heroLabel: { color: colors.voltInk },
  heroTitle: { fontFamily: fonts.display, fontSize: 44, lineHeight: 46, color: colors.voltInk },
  heroBody: { fontFamily: fonts.bodyStrong, fontSize: 15, color: colors.voltInk },
  heroButton: { backgroundColor: colors.voltInk, borderColor: colors.voltInk, marginTop: space.sm },
  call: { backgroundColor: colors.warnBg, borderColor: colors.warnLine },
  callLabel: { color: colors.warn },
  callTitle: { fontFamily: fonts.display, fontSize: 24, color: colors.ink },
  section: { justifyContent: 'space-between', marginTop: space.md },
  myCall: { gap: 2, paddingVertical: space.xs },
  myCallDivider: { borderTopWidth: 1, borderTopColor: colors.line, marginTop: space.xs, paddingTop: space.sm },
  verdict: { fontFamily: fonts.bodyStrong, fontSize: 14, color: colors.warn },
  verdictWon: { color: colors.volt },
  verdictLost: { color: colors.ink3 },
  link: { fontFamily: fonts.bodyStrong, fontSize: 15, color: colors.volt },
  name: { fontFamily: fonts.bodyStrong, fontSize: 17, color: colors.ink },
  arrow: { width: 44, height: 44, borderRadius: 10, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  arrowOff: { opacity: 0.3 },
  arrowText: { color: colors.ink, fontSize: 18 },
});
