import { MAX_WEIGHT } from '@sandbag/shared';
import { Stack } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { feel } from '@/components/motion';
import { Stepper } from '@/components/Stepper';
import { toast } from '@/components/Toast';
import { Button, Card, Chip, Field, Label, MoveButtons, Muted, NumberField, Row, Screen, Segments } from '@/components/ui';
import { reactionTo } from '@/data/actions';
import { jumpFor, usePrefs } from '@/data/prefs';
import { useData } from '@/data/store';
import { agoText, backfillDates, dayLabel, num, summary } from '@/domain/format';
import { activeLogged, buildHistory, lastLogged, recentWeights, type Draft, type DraftEntry } from '@/domain/history';
import { canMarkDrops, canVary, hasDrops, perSetLists, varies, withDone, withLastDrop, withSetCount, withSetValue, withVarying } from '@/domain/sets';
import { colors, fonts, radius, space } from '@/theme';
import { AddLift, useWorkout } from './workout';

const NOTE_MAX = 200;

const finishTitle = (draft: Draft, done: number) => (draft.editing ? 'Save changes' : `Finish · ${done} of ${draft.entries.length}`);

/** "Last time" for a lift, so the numbers to beat are in view. */
function LastTime({ name, date }: { name: string; date: string }) {
  const logged = useData((state) => state.logged);
  const last = useMemo(() => lastLogged(buildHistory(activeLogged(logged)), name, date), [logged, name, date]);
  return last ? <Muted>Last time, {agoText(last.date)}: {summary(last)}</Muted> : <Muted>First time logging this one.</Muted>;
}

/** The name, progress, the day it counts for, and the switch between layouts. `chips` adds a layout's own. */
function WorkoutHeader({ draft, done, chips, onRename, onRedate }: {
  draft: Draft;
  done: number;
  chips?: ReactNode;
  onRename: (title: string) => void;
  onRedate: (date: string) => void;
}) {
  const logging = usePrefs((state) => state.logging);
  const setLogging = usePrefs((state) => state.setLogging);
  const [pickingDate, setPickingDate] = useState(false);
  return (
    <>
      <TextInput
        accessibilityLabel="Workout name"
        maxLength={100}
        value={draft.title}
        onChangeText={onRename}
        style={styles.title}
      />
      {draft.entries.length ? <Segments total={draft.entries.length} done={done} /> : null}
      <Row style={styles.wrap}>
        {draft.editing ? null : <Chip title={dayLabel(draft.date)} active={pickingDate} onPress={() => setPickingDate(!pickingDate)} />}
        {chips}
        <Chip title={logging === 'steps' ? 'List view' : 'Step by step'} onPress={() => setLogging(logging === 'steps' ? 'list' : 'steps')} />
      </Row>
      {pickingDate ? (
        <>
          <Muted>Forgot to log one? Pick the day you trained.</Muted>
          <Row style={styles.wrap}>
            {backfillDates().map((date) => (
              <Chip key={date} title={dayLabel(date)} active={date === draft.date} onPress={() => {
                onRedate(date);
                setPickingDate(false);
              }} />
            ))}
          </Row>
        </>
      ) : null}
    </>
  );
}

function Editor({ entry, date, onChange, onRemove }: {
  entry: DraftEntry;
  date: string;
  onChange: (changes: Partial<DraftEntry>) => void;
  onRemove: () => void;
}) {
  const logged = useData((state) => state.logged);
  const jump = usePrefs((state) => jumpFor(state.jumps, entry.name));
  const weights = useMemo(() => recentWeights(buildHistory(activeLogged(logged)), entry.name), [logged, entry.name]);
  const varying = varies(entry);
  const lists = perSetLists(entry);
  const dropped = hasDrops(entry);

  return (
    <View style={styles.editor}>
      <LastTime name={entry.name} date={date} />
      <Row style={styles.wrap}>
        <Chip title="Weight" active={entry.kind === 'strength'} onPress={() => onChange({ kind: 'strength' })} />
        <Chip title="Time" active={entry.kind === 'time'} onPress={() => onChange({ kind: 'time' })} />
        {entry.kind === 'strength' ? <Chip title="Each side" active={entry.perSide} onPress={() => onChange({ perSide: !entry.perSide })} /> : null}
        {entry.kind === 'strength' && canVary(entry.sets ?? 0) ? <Chip title="Vary sets" active={varying} onPress={() => onChange(withVarying(entry, !varying))} /> : null}
        {entry.kind === 'strength' && canMarkDrops(entry.sets ?? 1) ? <Chip title="Drop set" active={dropped} onPress={() => onChange(withLastDrop(entry, !dropped))} /> : null}
      </Row>
      {entry.kind === 'time' ? (
        <NumberField label="Minutes" unit="min" value={entry.minutes} max={1440} onChange={(minutes) => onChange({ minutes })} />
      ) : (
        <>
          {varying ? null : <Stepper label="Weight, kg" unit="kg" value={entry.weight} step={jump} max={MAX_WEIGHT} onChange={(weight) => onChange({ weight })} />}
          {!varying && weights.length > 1 ? (
            <Row style={styles.wrap}>
              {weights.map((weight) => <Chip key={weight} title={num(weight)} active={entry.weight === weight} onPress={() => onChange({ weight })} />)}
            </Row>
          ) : null}
          <Label>Bar or machine weight</Label>
          <Row style={styles.wrap}>
            <Chip title="Included" active={entry.includesEquipment === true} onPress={() => onChange({ includesEquipment: entry.includesEquipment === true ? undefined : true })} />
            <Chip title="Not included" active={entry.includesEquipment === false} onPress={() => onChange({ includesEquipment: entry.includesEquipment === false ? undefined : false })} />
          </Row>
          <Row>
            <NumberField label="Sets" decimals={false} value={entry.sets} max={1000} onChange={(sets) => onChange(withSetCount(entry, sets))} />
            {varying ? null : <NumberField label="Reps" decimals={false} value={entry.reps} max={1000} onChange={(reps) => onChange({ reps })} />}
            <NumberField label="RPE" value={entry.rpe} max={10} onChange={(rpe) => onChange({ rpe })} />
          </Row>
          {varying ? lists.setReps.map((reps, set) => (
            <Row key={set} style={styles.bottom}>
              <Text style={styles.setName}>Set {set + 1}</Text>
              <NumberField label="kg" unit="kg" value={lists.setWeights[set] ?? null} max={MAX_WEIGHT} onChange={(value) => onChange(withSetValue(entry, set, 'weight', value))} />
              <NumberField label="Reps" decimals={false} value={reps} max={1000} onChange={(value) => onChange(withSetValue(entry, set, 'reps', value))} />
            </Row>
          )) : null}
        </>
      )}
      <Field label="Note" placeholder="last set 13.6" maxLength={NOTE_MAX} value={entry.note} onChangeText={(note) => onChange({ note })} />
      <Button title="Remove from today" variant="danger" onPress={onRemove} />
    </View>
  );
}

/** Every lift on one list: open one to change its numbers, tick it when it's done. */
export function ListLog({ draft }: { draft: Draft }) {
  const workout = useWorkout(draft);
  const [openId, setOpenId] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);

  const toggle = (entry: DraftEntry) => {
    const next = !entry.done;
    workout.update(entry.id, withDone(next));
    if (!next) return;
    if (openId === entry.id) setOpenId(null);
    feel.tick();
    const reaction = reactionTo(entry, draft.date);
    if (reaction) toast(reaction);
  };

  return (
    <Screen padTop={false} footer={<Button title={finishTitle(draft, workout.done)} onPress={workout.finish} />}>
      {/* The step-by-step layout puts its own title and menu up there. */}
      <Stack.Screen options={{ headerTitle: undefined, headerRight: undefined }} />
      <WorkoutHeader
        draft={draft}
        done={workout.done}
        onRename={workout.rename}
        onRedate={workout.redate}
        chips={draft.entries.length > 1 ? (
          <Chip title={reordering ? 'Done reordering' : 'Reorder'} active={reordering} onPress={() => {
            setOpenId(null);
            setReordering(!reordering);
          }} />
        ) : null}
      />
      {draft.entries.map((entry, position) => {
        const open = openId === entry.id;
        if (reordering) {
          return (
            <Card key={entry.id} style={entry.done ? styles.done : undefined}>
              <Row>
                <Text style={[styles.name, styles.flex]}>{entry.name}</Text>
                <MoveButtons name={entry.name} index={position} total={draft.entries.length} onMove={(delta) => workout.move(position, position + delta)} />
              </Row>
            </Card>
          );
        }
        return (
          <Card key={entry.id} style={entry.done ? styles.done : undefined}>
            <Row>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${entry.name}, ${open ? 'close' : 'edit'}`}
                accessibilityState={{ expanded: open }}
                onPress={() => setOpenId(open ? null : entry.id)}
                style={styles.flex}
              >
                <Text style={styles.name}>{entry.name}</Text>
                <Muted>{summary(entry)}</Muted>
                {entry.note ? <Muted numberOfLines={1}>{entry.note}</Muted> : null}
              </Pressable>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityLabel={`${entry.name} done`}
                accessibilityState={{ checked: entry.done }}
                hitSlop={6}
                onPress={() => toggle(entry)}
                style={[styles.tick, entry.done && styles.tickOn]}
              >
                <Text style={[styles.tickText, entry.done && styles.tickTextOn]}>✓</Text>
              </Pressable>
            </Row>
            {open ? (
              <Editor entry={entry} date={draft.date} onChange={(changes) => workout.update(entry.id, changes)} onRemove={() => workout.remove(entry.id)} />
            ) : null}
          </Card>
        );
      })}
      <AddLift draft={draft} onAdd={(name) => setOpenId(workout.add(name))} />
      <Button title="Discard" variant="danger" onPress={() => void workout.discard()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  title: { fontFamily: fonts.display, fontSize: 36, lineHeight: 42, color: colors.ink, textTransform: 'uppercase', padding: 0 },
  done: { backgroundColor: colors.doneBg, borderColor: colors.doneLine },
  name: { fontFamily: fonts.bodyStrong, fontSize: 17, color: colors.ink },
  tick: { width: 48, height: 48, borderRadius: radius.md, borderWidth: 2, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  tickOn: { backgroundColor: colors.volt, borderColor: colors.volt },
  tickText: { fontSize: 22, color: colors.ink3 },
  tickTextOn: { color: colors.voltInk },
  editor: { gap: space.md, marginTop: space.sm },
  bottom: { alignItems: 'flex-end' },
  wrap: { flexWrap: 'wrap' },
  setName: { width: 56, paddingBottom: space.md, fontFamily: fonts.bodyStrong, fontSize: 15, color: colors.ink2 },
});
