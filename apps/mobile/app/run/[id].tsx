import { believable, distancePoints, MAX_RUN_KM, pacePoints, pbDistanceOf, personalBest, runTime, voice, type Activity, type Run } from '@sandbag/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { toast } from '@/components/Toast';
import { Button, Chip, Field, Label, Muted, NumberField, Row, Screen, Segmented, Title } from '@/components/ui';
import { deleteRun, saveRun } from '@/data/actions';
import { useData } from '@/data/store';
import { backfillDates, dayLabel, today } from '@/domain/format';
import { activeRuns, fromSeconds, pace, runTitle, toSeconds } from '@/domain/runs';
import { leave } from '@/nav';
import { colors, fonts, space } from '@/theme';

const ACTIVITY_OPTIONS: { key: Activity; label: string }[] = [
  { key: 'run', label: 'Run' },
  { key: 'walk', label: 'Walk' },
];

type Effort = Pick<Run, 'activity' | 'distanceKm' | 'seconds'>;

/** Where this run stands against your PB at its race distance, if it's run at one. For reference, it scores nothing. */
function pbLine(run: Effort, runs: Run[], editing: string | undefined): string | null {
  const race = pbDistanceOf(run);
  if (!race) return null;
  const best = personalBest(runs.filter((other) => other.id !== editing), race);
  if (!best) return `Your first ${race.name} on record. That’s the PB to beat.`;
  if (run.seconds < best.seconds) return `New ${race.name} PB, ${runTime(best.seconds - run.seconds)} faster than ${runTime(best.seconds)}.`;
  return `${race.name} PB: ${runTime(best.seconds)}.`;
}

/** What the run on screen is worth: its pace, its points and where it stands against your PB. */
function Preview({ run, runs, editing }: { run: Effort; runs: Run[]; editing: string | undefined }) {
  if (!believable(run)) return <Muted style={styles.warn}>{voice.tooFast()}</Muted>;
  const pb = pbLine(run, runs, editing);
  return (
    <>
      <Muted>+{Math.round(distancePoints(run))} for the distance{run.activity === 'run' ? `, +${pacePoints(run)} for the pace` : ''}</Muted>
      {pb ? <Muted>{pb}</Muted> : null}
    </>
  );
}

/** Log a run or walk on its own, or change one: `new`, or the id of the run. */
export default function RunScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const allRuns = useData((state) => state.runs);
  const runs = useMemo(() => activeRuns(allRuns), [allRuns]);
  const existing = id && id !== 'new' ? allRuns[id] : undefined;
  const time = existing ? fromSeconds(existing.seconds) : null;
  const [activity, setActivity] = useState<Activity>(existing?.activity ?? 'run');
  const [distanceKm, setDistanceKm] = useState<number | null>(existing?.distanceKm ?? null);
  const [hours, setHours] = useState<number | null>(time?.hours || null);
  const [minutes, setMinutes] = useState<number | null>(time?.minutes ?? null);
  const [seconds, setSeconds] = useState<number | null>(time?.seconds || null);
  const [date, setDate] = useState(existing?.date ?? today());
  const [note, setNote] = useState(existing?.note ?? '');

  if (id !== 'new' && (!existing || existing.deleted)) return null;

  const total = toSeconds({ hours, minutes, seconds });
  const done = distanceKm && total ? { activity, distanceKm, seconds: total } : null;
  // A run from before the backfill week keeps its own day on the list.
  const dates = backfillDates().includes(date) ? backfillDates() : [date, ...backfillDates()];

  /** Saves what's on screen, then goes back, or on to share it as saved. */
  const save = (then: 'back' | 'share') => {
    if (!done) return;
    const run = saveRun({ ...done, date, note }, existing?.id);
    if (then === 'share') {
      router.replace(`/share?runId=${run.id}`);
      return;
    }
    toast(existing ? 'Saved.' : voice.runLogged(Date.now()));
    leave();
  };

  return (
    <Screen
      padTop={false}
      footer={(
        // Logging a run is the moment to show it off, so sharing leads. An edit is usually a fix, so saving does.
        existing ? (
          <Row>
            <View style={styles.flex}><Button title="Save" disabled={!done} onPress={() => save('back')} /></View>
            <View style={styles.flex}><Button title="Save and share" variant="ghost" disabled={!done} onPress={() => save('share')} /></View>
          </Row>
        ) : (
          <Row>
            <View style={styles.flex}><Button title="Log and share" disabled={!done} onPress={() => save('share')} /></View>
            <View style={styles.flex}><Button title="Log only" variant="ghost" disabled={!done} onPress={() => save('back')} /></View>
          </Row>
        )
      )}
    >
      <Title>{existing ? `Edit ${activity}` : `Log a ${activity}`}</Title>
      <Segmented options={ACTIVITY_OPTIONS} value={activity} onChange={setActivity} />

      <NumberField label="Distance (km)" value={distanceKm} onChange={setDistanceKm} max={MAX_RUN_KM} unit="km" />

      <View style={styles.group}>
        <Label>Time</Label>
        <Row>
          <NumberField label="Hours" value={hours} onChange={setHours} max={167} decimals={false} />
          <NumberField label="Minutes" value={minutes} onChange={setMinutes} max={59} decimals={false} />
          <NumberField label="Seconds" value={seconds} onChange={setSeconds} max={59} decimals={false} />
        </Row>
      </View>

      {done ? (
        <View style={styles.group}>
          <Text style={styles.pace}>{pace(done)}</Text>
          <Preview run={done} runs={runs} editing={existing?.id} />
        </View>
      ) : null}

      <View style={styles.group}>
        <Label>Day</Label>
        <Row style={styles.wrap}>
          {dates.map((day) => <Chip key={day} title={dayLabel(day)} active={day === date} onPress={() => setDate(day)} />)}
        </Row>
      </View>

      <Field label="Note" placeholder="Route, weather, excuses" maxLength={200} value={note} onChangeText={setNote} />

      {existing ? (
        <Button title={`Delete ${activity}`} variant="danger" onPress={() => {
          const undo = deleteRun(existing);
          leave();
          toast(`${runTitle(existing)} deleted.`, undo);
        }} />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  group: { gap: space.xs },
  wrap: { flexWrap: 'wrap' },
  pace: { fontFamily: fonts.display, fontSize: 32, color: colors.volt },
  warn: { color: colors.warn },
});
