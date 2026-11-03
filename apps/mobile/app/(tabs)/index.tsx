import { addDays, exerciseKey, goalIn, mondayOf, STARTER_WORKOUTS, trainedDates, voice, weekStreak, type SavedWorkout } from '@sandbag/shared';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { api } from '@/api/client';
import { useSession } from '@/auth/session';
import { BodyMap } from '@/components/BodyMap';
import { DragList } from '@/components/controls';
import { Icon } from '@/components/icons';
import { FadeIn, feel } from '@/components/motion';
import { Sheet } from '@/components/Sheet';
import { Button, Card, Heading, Label, ListGroup, ListRow, Muted, Row, Screen, Title } from '@/components/ui';
import { WeekDots } from '@/components/WeekDots';
import { okToReplaceDraft } from '@/components/confirm';
import { addExerciseToDraft, createFromStarter, startBlank, startFromSaved } from '@/data/actions';
import { useData } from '@/data/store';
import { syncNow } from '@/data/sync';
import { num, plural, toIsoDate } from '@/domain/format';
import { activeLogged, activeSaved, goalsFor, nextWorkout, previewLoad, volumeOf, weekRecap } from '@/domain/history';
import { colors, fonts, radius, space } from '@/theme';

const QUIET_DAYS = 5;
const MINUTES_PER_EXERCISE = 9;

async function start(workout: SavedWorkout) {
  if (!(await okToReplaceDraft())) return;
  feel.tick();
  startFromSaved(workout);
  router.push('/workout/active');
}

async function startEmpty() {
  if (!(await okToReplaceDraft())) return;
  startBlank();
  router.push('/workout/active');
}

/** Straight to the called lift: inside the workout in progress or up next if it's in there, or on its own. */
function settle(lift: string, upNext: SavedWorkout | null) {
  feel.warn();
  const key = exerciseKey(lift);
  const { draft, setDraft } = useData.getState();
  if (!draft && upNext?.exercises.some((item) => exerciseKey(item.name) === key)) startFromSaved(upNext);
  else if (!draft) startBlank();
  const current = useData.getState().draft;
  if (current && !current.entries.some((item) => exerciseKey(item.name) === key)) setDraft(addExerciseToDraft(current, lift));
  router.push('/workout/active');
}

/** The next thing the streak needs, in one line. */
function streakLine(days: number, goal: number, streak: number, shields: number): string {
  const left = goal - days;
  const shield = shields ? ` You’ve got ${plural(shields, 'shield')} if you need ${shields === 1 ? 'it' : 'them'}.` : '';
  if (left <= 0) return streak > 1 ? `Goal hit. ${streak} weeks running.` : 'Goal hit. That’s a week on the board.';
  const need = `${plural(left, 'more day')}`;
  return streak ? `${need} keeps your ${streak}-week streak.${shield}` : `${need} to hit your goal of ${goal}.`;
}

export default function Train() {
  const logged = useData((state) => state.logged);
  const saved = useData((state) => state.saved);
  const draft = useData((state) => state.draft);
  const putSaved = useData((state) => state.putSaved);
  const me = useSession((state) => state.me);
  const workouts = useMemo(() => activeLogged(logged), [logged]);
  const rotation = useMemo(() => activeSaved(saved), [saved]);
  const upNext = nextWorkout(rotation, workouts);
  // A number to beat, before you've even picked up the bar.
  const lastTime = upNext ? workouts.filter((item) => item.savedWorkoutId === upNext.id).reduce<typeof workouts[number] | null>((latest, item) => (!latest || item.date > latest.date ? item : latest), null) : null;
  const toBeat = lastTime ? volumeOf(lastTime) : 0;
  const calls = useQuery({ queryKey: ['calls'], queryFn: api.calls });
  const notifications = useQuery({ queryKey: ['notifications'], queryFn: api.notifications });
  const [others, setOthers] = useState(false);
  const [starters, setStarters] = useState(false);
  const unread = notifications.data?.filter((item) => !item.read).length ?? 0;
  const openOnMe = calls.data?.filter((call) => call.status === 'open' && call.target.id === me?.id) ?? [];
  const last = workouts[0];
  const today = toIsoDate(new Date());
  const quietDays = last ? Math.round((Date.parse(today) - Date.parse(last.date)) / 86_400_000) : 0;
  const trained = useMemo(() => trainedDates(workouts), [workouts]);
  const goals = goalsFor(me);
  const goal = goalIn(goals, today);
  const streak = weekStreak(trained, goals, today, me?.pausedWeeks);
  const days = trained.filter((date) => date >= mondayOf(today) && date <= today).length;
  const lastMonday = addDays(mondayOf(today), -7);
  const recapSeen = useData((state) => state.recapSeen);
  const recap = useMemo(() => weekRecap(workouts, lastMonday), [workouts, lastMonday]);

  return (
    <Screen onRefresh={() => Promise.all([syncNow(), calls.refetch(), notifications.refetch()])}>
      <Row style={styles.top}>
        <Title style={styles.brand}>Sandbag</Title>
        <Pressable accessibilityRole="button" accessibilityLabel={`Notifications, ${unread} unread`} hitSlop={8} onPress={() => router.push('/notifications')} style={styles.bell}>
          <Icon name="bell" size={24} color={colors.ink} />
          {unread ? <View style={styles.badge}><Text style={styles.badgeText}>{unread > 9 ? '9+' : unread}</Text></View> : null}
        </Pressable>
      </Row>

      <FadeIn>
        {draft ? (
          <Card style={styles.hero}>
            <Label style={styles.heroLabel}>In progress</Label>
            <Text numberOfLines={2} style={styles.heroTitle}>{draft.title.toUpperCase()}</Text>
            <Text style={styles.heroBody}>{plural(draft.entries.length, 'lift')}. Pick up where you left off.</Text>
            <Button title="Back to it" variant="ghost" style={styles.heroButton} onPress={() => router.push('/workout/active')} />
          </Card>
        ) : upNext ? (
          <Card style={styles.hero}>
            <Row style={styles.heroTop}>
              <View style={styles.flex}>
                <Label style={styles.heroLabel}>Up next</Label>
                <Text numberOfLines={2} style={styles.heroTitle}>{upNext.name.toUpperCase()}</Text>
                <Text style={styles.heroBody}>{plural(upNext.exercises.length, 'lift')}, about {upNext.exercises.length * MINUTES_PER_EXERCISE} min. {toBeat ? `Last time you moved ${toBeat.toLocaleString('en-US')} kg. Beat it.` : workouts.length ? 'Your numbers are loaded.' : 'We’ll learn your numbers as you go.'}</Text>
              </View>
              <BodyMap size={56} levels={previewLoad(upNext.exercises)} />
            </Row>
            <Button title="Start" variant="ghost" style={styles.heroButton} onPress={() => start(upNext)} />
          </Card>
        ) : (
          <Card style={styles.hero}>
            <Label style={styles.heroLabel}>First rep</Label>
            <Text style={styles.heroTitle}>PICK A WORKOUT</Text>
            <Text style={styles.heroBody}>Choose one that’s ready to go. You can change anything later.</Text>
            <Button title="Choose" variant="ghost" style={styles.heroButton} onPress={() => setStarters(true)} />
          </Card>
        )}
      </FadeIn>

      <FadeIn delay={80}>
        <View style={styles.week}>
          <WeekDots trained={trained} today={today} />
          <Text style={styles.streak}>{streakLine(days, goal, streak.current, streak.shields)}</Text>
          {quietDays >= QUIET_DAYS ? <Muted>{voice.quiet(quietDays, quietDays)}</Muted> : null}
        </View>
      </FadeIn>

      {recap.sessions.length && recapSeen !== lastMonday ? (
        <FadeIn delay={120}>
          <Card style={styles.recap} label={`Last week's recap, ${recap.moved.toLocaleString('en-US')} kilos moved`} onPress={() => { feel.tap(); router.push(`/recap?monday=${lastMonday}`); }}>
            <Label style={styles.settle}>Last week</Label>
            <Text style={styles.callTitle}>{recap.moved ? `${recap.moved.toLocaleString('en-US')} KG` : plural(recap.sessions.length, 'session').toUpperCase()}. SEE HOW IT WENT.</Text>
          </Card>
        </FadeIn>
      ) : null}

      {openOnMe.map((call) => (
        <FadeIn key={call.id} delay={140}>
          <Card style={styles.call} label={`${call.caller.displayName} called sandbag on your ${call.exercise}. Settle it now.`} onPress={() => settle(call.exercise, upNext ?? null)}>
            <Label style={styles.callLabel}>{call.caller.displayName} called sandbag</Label>
            <Text style={styles.callTitle}>{`${call.exercise}${call.targetWeight === null ? '' : `: beat ${num(call.targetWeight)} kg${call.targetReps ? ` × ${call.targetReps}` : ''}`}`.toUpperCase()}</Text>
            <Muted>“{call.line}” Your next session of this lift settles it. {plural(Math.max(0, Math.ceil((Date.parse(call.deadlineAt) - Date.now()) / 86_400_000)), 'day')} left.</Muted>
            <Label style={styles.settle}>Settle it now</Label>
          </Card>
        </FadeIn>
      ))}

      <FadeIn delay={180}>
        <Button title={rotation.length ? 'Other workouts' : 'Start empty'} variant="ghost" onPress={() => {
          if (rotation.length) setOthers(true);
          else void startEmpty();
        }} />
      </FadeIn>

      <Sheet visible={others} onClose={() => setOthers(false)} title="Your workouts">
        <Muted>They run in this order and loop. Drag to change it.</Muted>
        <DragList
          items={rotation}
          keyOf={(workout) => workout.id}
          label={(workout) => workout.name}
          renderItem={(workout) => (
            <Pressable accessibilityRole="button" accessibilityLabel={`Open ${workout.name}`} onPress={() => { setOthers(false); router.push(`/workout/saved/${workout.id}`); }} style={styles.saved}>
              <Text style={styles.savedName}>{workout.name}</Text>
              <Muted>{plural(workout.exercises.length, 'lift')}{workout.savedFrom ? ` · from ${workout.savedFrom}` : ''}</Muted>
            </Pressable>
          )}
          onMove={(from, to) => {
            const order = [...rotation];
            const [moved] = order.splice(from, 1);
            if (moved) order.splice(to, 0, moved);
            order.forEach((workout, position) => {
              if (workout.position !== position) putSaved({ ...workout, position });
            });
          }}
        />
        <ListGroup>
          <ListRow title="New workout" onPress={() => { setOthers(false); router.push('/workout/edit/new'); }} />
          <ListRow title="Ready-made workouts" onPress={() => { setOthers(false); setStarters(true); }} />
          <ListRow title="Start empty" onPress={() => {
            setOthers(false);
            void startEmpty();
          }} />
        </ListGroup>
      </Sheet>

      <Sheet visible={starters} onClose={() => setStarters(false)} title="Pick a workout">
        {STARTER_WORKOUTS.map((starter) => (
          <Pressable
            key={starter.name}
            accessibilityRole="button"
            accessibilityLabel={`${starter.name}: ${starter.blurb}`}
            onPress={() => {
              feel.tick();
              createFromStarter(starter);
              setStarters(false);
            }}
            style={({ pressed }) => [styles.starter, pressed && styles.pressed]}
          >
            <BodyMap size={44} levels={previewLoad(starter.exercises.map((name) => ({ name })))} />
            <View style={styles.flex}>
              <Heading>{starter.name}</Heading>
              <Muted>{starter.blurb}</Muted>
            </View>
          </Pressable>
        ))}
        <Button title="Build my own" variant="ghost" onPress={() => { setStarters(false); router.push('/workout/edit/new'); }} />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  top: { justifyContent: 'space-between' },
  brand: { color: colors.volt, fontSize: 34, lineHeight: 40 },
  bell: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: 4, right: 2, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.volt },
  badgeText: { fontFamily: fonts.bodyStrong, fontSize: 11, color: colors.voltInk },
  hero: { backgroundColor: colors.volt, borderColor: colors.volt },
  heroTop: { alignItems: 'flex-start', gap: space.sm },
  heroLabel: { color: colors.voltInk },
  heroTitle: { fontFamily: fonts.display, fontSize: 56, lineHeight: 60, color: colors.voltInk },
  heroBody: { fontFamily: fonts.bodyStrong, fontSize: 15, color: colors.voltInk },
  heroButton: { backgroundColor: colors.voltInk, borderColor: colors.voltInk, marginTop: space.sm, minHeight: 60 },
  week: { gap: space.md, paddingVertical: space.sm },
  streak: { fontFamily: fonts.bodyStrong, fontSize: 17, lineHeight: 22, color: colors.ink },
  call: { backgroundColor: colors.warnBg, borderColor: colors.warnLine },
  callLabel: { color: colors.warn },
  settle: { color: colors.volt },
  recap: { gap: space.xs },
  callTitle: { fontFamily: fonts.display, fontSize: 24, color: colors.ink },
  saved: { minHeight: 64, justifyContent: 'center', paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.md, backgroundColor: colors.surface2 },
  savedName: { fontFamily: fonts.bodyStrong, fontSize: 17, color: colors.ink },
  starter: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.lg, backgroundColor: colors.surface2 },
  pressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
});
