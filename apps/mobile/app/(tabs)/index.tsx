import { HONEST_MARGIN, voice, type CallStatus, type CallView, type SavedWorkout } from '@sandbag/shared';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { api } from '@/api/client';
import { useSession } from '@/auth/session';
import { Button, Card, Heading, Label, MoveButtons, Muted, Row, Screen, Title } from '@/components/ui';
import { moveSaved, startBlank, startFromSaved } from '@/data/actions';
import { useData } from '@/data/store';
import { syncNow } from '@/data/sync';
import { agoLong, agoText, daysLeft, formatDate, num, plural, signedPoints, today } from '@/domain/format';
import { activeLogged, activeSaved, nextWorkout } from '@/domain/history';
import { colors, fonts, space } from '@/theme';

const QUIET_DAYS = 5;
const MY_CALLS_SHOWN = 5;
const VERDICT: Record<CallStatus, string> = {
  open: 'Waiting on their next session of it',
  watching: 'Just missed, at their limit. Watching them.',
  cleared: 'They beat it. Call answered.',
  failed: 'Sandbag confirmed. You were right.',
  honest: 'An honest miss. Nobody scores.',
  caught: 'Caught sandbagging. Double points.',
};

/** The number to beat, when you're allowed to see it: "60 kg × 8". */
function targetText(call: CallView): string | null {
  if (call.targetWeight === null) return null;
  return call.targetReps ? `${num(call.targetWeight)} kg × ${call.targetReps}` : `${num(call.targetWeight)} kg`;
}

/** Where a call stands, from your side: time left while it's live, points once it's settled. */
function standing(call: CallView): string {
  if (call.deadlineAt) return `${VERDICT[call.status]} · ${daysLeft(call.deadlineAt)}`;
  return call.points ? `${VERDICT[call.status]} · ${signedPoints(call.points)}` : VERDICT[call.status];
}

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
  const onMe = calls.data?.filter((call) => call.deadlineAt && call.target.id === me?.id) ?? [];
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

      {onMe.map((call) => (
        <Card key={call.id} style={styles.call}>
          <Label style={styles.callLabel}>{call.status === 'watching' ? 'Honest miss, for now' : `${call.caller.displayName} called sandbag`}</Label>
          <Text style={styles.callTitle}>{`${call.exercise}: ${call.status === 'watching' ? '' : 'beat '}${targetText(call)}`.toUpperCase()}</Text>
          <Muted>
            {call.status === 'watching'
              ? `You were just short, at your limit. Lift ${HONEST_MARGIN * 100}% past it before the watch ends and it was a sandbag. ${daysLeft(call.deadlineAt!)}.`
              : `“${call.line}” Your next session of this lift settles it. ${daysLeft(call.deadlineAt!)}.`}
          </Muted>
        </Card>
      ))}

      {byMe.length ? (
        <>
          <Heading style={styles.section}>Your calls</Heading>
          <Card>
            {byMe.map((call, index) => (
              <View key={call.id} style={[styles.myCall, index > 0 && styles.myCallDivider]}>
                <Text style={styles.name}>{call.target.displayName} · {call.exercise}{targetText(call) ? ` ${targetText(call)}` : ''}</Text>
                <Text style={[styles.verdict, call.points > 0 && styles.verdictWon, call.points < 0 && styles.verdictLost]}>{standing(call)}</Text>
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
        <Card key={workout.id}>
          {/* The arrows sit beside the link, not inside it: a button can't hold other buttons. */}
          <Row>
            <Pressable accessibilityRole="button" accessibilityLabel={`Open ${workout.name}`} onPress={() => router.push(`/workout/saved/${workout.id}`)} style={({ pressed }) => [styles.flex, pressed && styles.pressed]}>
              <Text style={styles.name}>{workout.name}</Text>
              <Muted>{plural(workout.exercises.length, 'exercise')}{workout.savedFrom ? ` · from ${workout.savedFrom}` : ''}</Muted>
            </Pressable>
            <MoveButtons name={workout.name} index={index} total={rotation.length} onMove={(delta) => moveSaved(rotation, index, delta)} />
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
  pressed: { opacity: 0.75 },
});
