import { exerciseKey, MAX_VARIED_SETS, MAX_WEIGHT, voice } from '@sandbag/shared';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { toast } from '@/components/Toast';
import { leave } from '@/nav';
import { confirm } from '@/components/confirm';
import { Button, Card, Chip, Field, Heading, Label, MoveButtons, Muted, NumberField, Row, Screen, Segments } from '@/components/ui';
import { addExerciseToDraft, finishDraft, reactionTo } from '@/data/actions';
import { useData } from '@/data/store';
import { agoText, backfillDates, dayLabel, num, round2, summary } from '@/domain/format';
import { activeLogged, buildHistory, fitPerSet, lastLogged, moveItem, recentWeights, type DraftEntry } from '@/domain/history';
import { colors, fonts, radius, space } from '@/theme';

const WEIGHT_STEP = 2.5;
const NOTE_MAX = 200;

function Editor({ entry, date, onChange, onRemove }: {
  entry: DraftEntry;
  date: string;
  onChange: (changes: Partial<DraftEntry>) => void;
  onRemove: () => void;
}) {
  const logged = useData((state) => state.logged);
  const index = useMemo(() => buildHistory(activeLogged(logged)), [logged]);
  const last = lastLogged(index, entry.name, date);
  const weights = recentWeights(index, entry.name);
  const stepWeight = (delta: number) => {
    const next = Math.max(0, round2((entry.weight ?? 0) + delta));
    if (next > MAX_WEIGHT) toast(voice.overLimit(`${MAX_WEIGHT} kg`));
    onChange({ weight: Math.min(next, MAX_WEIGHT) });
  };
  const sets = entry.sets ?? 0;
  const canVary = sets >= 2 && sets <= MAX_VARIED_SETS;
  const varying = canVary && (entry.setReps !== undefined || entry.setWeights !== undefined);
  // Both lists, one value per set, filled from the usual numbers where nothing's typed yet.
  const perSet = (count: number) => ({ setReps: fitPerSet(entry.setReps ?? [], count, entry.reps), setWeights: fitPerSet(entry.setWeights ?? [], count, entry.weight) });
  const lists = perSet(sets);
  // Typing "12" passes through "1", so values only change once the count is one that can vary.
  const changeSets = (next: number | null) => {
    const fits = varying && next !== null && next >= 2 && next <= MAX_VARIED_SETS;
    onChange({ sets: next, ...(fits ? perSet(next) : {}) });
  };
  const changeSet = (set: number, field: 'setReps' | 'setWeights', value: number | null) => {
    const list = lists[field].map((item, position) => (position === set ? value : item));
    if (field === 'setReps') return onChange({ ...lists, setReps: list, reps: entry.reps ?? value });
    // The heaviest set stays the weight, which next time starts from.
    const weighed = list.filter((item): item is number => item !== null);
    onChange({ ...lists, setWeights: list, weight: weighed.length ? Math.max(...weighed) : null });
  };

  return (
    <View style={styles.editor}>
      {last ? <Muted>Last time, {agoText(last.date)}: {summary(last)}</Muted> : <Muted>First time logging this one.</Muted>}
      <Row style={styles.wrap}>
        <Chip title="Weight" active={entry.kind === 'strength'} onPress={() => onChange({ kind: 'strength' })} />
        <Chip title="Time" active={entry.kind === 'time'} onPress={() => onChange({ kind: 'time' })} />
        {entry.kind === 'strength' ? <Chip title="Each side" active={entry.perSide} onPress={() => onChange({ perSide: !entry.perSide })} /> : null}
        {entry.kind === 'strength' && canVary ? (
          <Chip title="Vary sets" active={varying} onPress={() => onChange(varying ? { setReps: undefined, setWeights: undefined } : lists)} />
        ) : null}
      </Row>
      {entry.kind === 'time' ? (
        <NumberField label="Minutes" unit="min" value={entry.minutes} max={1440} onChange={(minutes) => onChange({ minutes })} />
      ) : (
        <>
          {varying ? null : (
            <Row style={styles.bottom}>
              <Pressable accessibilityRole="button" accessibilityLabel={`Lower weight by ${WEIGHT_STEP}`} onPress={() => stepWeight(-WEIGHT_STEP)} style={styles.step}><Text style={styles.stepText}>−</Text></Pressable>
              <NumberField label="Weight, kg" unit="kg" value={entry.weight} max={MAX_WEIGHT} onChange={(weight) => onChange({ weight })} />
              <Pressable accessibilityRole="button" accessibilityLabel={`Raise weight by ${WEIGHT_STEP}`} onPress={() => stepWeight(WEIGHT_STEP)} style={styles.step}><Text style={styles.stepText}>+</Text></Pressable>
            </Row>
          )}
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
            <NumberField label="Sets" decimals={false} value={entry.sets} max={1000} onChange={changeSets} />
            {varying ? null : <NumberField label="Reps" decimals={false} value={entry.reps} max={1000} onChange={(reps) => onChange({ reps })} />}
            <NumberField label="RPE" value={entry.rpe} max={10} onChange={(rpe) => onChange({ rpe })} />
          </Row>
          {varying ? lists.setReps.map((reps, set) => (
            <Row key={set} style={styles.bottom}>
              <Text style={styles.setName}>Set {set + 1}</Text>
              <NumberField label="kg" unit="kg" value={lists.setWeights[set] ?? null} max={MAX_WEIGHT} onChange={(value) => changeSet(set, 'setWeights', value)} />
              <NumberField label="Reps" decimals={false} value={reps} max={1000} onChange={(value) => changeSet(set, 'setReps', value)} />
            </Row>
          )) : null}
        </>
      )}
      <Field label="Note" placeholder="last set 13.6" maxLength={NOTE_MAX} value={entry.note} onChangeText={(note) => onChange({ note })} />
      <Button title="Remove from today" variant="danger" onPress={onRemove} />
    </View>
  );
}

export default function ActiveWorkout() {
  const draft = useData((state) => state.draft);
  const setDraft = useData((state) => state.setDraft);
  const logged = useData((state) => state.logged);
  const [openId, setOpenId] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);
  const [pickingDate, setPickingDate] = useState(false);
  const [newName, setNewName] = useState('');
  const known = useMemo(() => [...buildHistory(activeLogged(logged)).values()].map((item) => item.name), [logged]);

  if (!draft) {
    return (
      <Screen padTop={false}>
        <Heading>Nothing in progress</Heading>
        <Button title="Back" variant="ghost" onPress={leave} />
      </Screen>
    );
  }

  const done = draft.entries.filter((entry) => entry.done).length;
  const update = (id: string, changes: Partial<DraftEntry>) =>
    setDraft({ ...draft, entries: draft.entries.map((entry) => (entry.id === id ? { ...entry, ...changes } : entry)) });

  const toggle = (entry: DraftEntry) => {
    const next = !entry.done;
    update(entry.id, { done: next });
    if (!next) return;
    if (openId === entry.id) setOpenId(null);
    if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const reaction = reactionTo(entry, draft.date);
    if (reaction) toast(reaction);
  };

  const add = (name: string) => {
    if (!name.trim()) return;
    const next = addExerciseToDraft(draft, name);
    setDraft(next);
    setOpenId(next.entries.at(-1)?.id ?? null);
    setNewName('');
  };

  const finish = () => {
    if (!done) {
      toast('Nothing’s ticked. Bold way to log a workout.');
      return;
    }
    const workout = finishDraft(draft);
    router.replace(`/workout/finished?id=${workout.id}`);
  };

  const discard = async () => {
    const message = draft.editing ? 'Your changes will be lost. The logged session stays.' : 'None of this will be logged.';
    if (await confirm('Discard this workout?', message, 'Discard')) {
      setDraft(null);
      leave();
    }
  };

  const query = exerciseKey(newName);
  const inDraft = new Set(draft.entries.map((entry) => exerciseKey(entry.name)));
  const suggestions = known
    .filter((name) => !inDraft.has(exerciseKey(name)) && (!query || exerciseKey(name).includes(query)))
    .slice(0, 6);

  return (
    <Screen
      padTop={false}
      footer={<Button title={draft.editing ? 'Save changes' : `Finish · ${done} of ${draft.entries.length}`} onPress={finish} />}
    >
      <TextInput
        accessibilityLabel="Workout name"
        maxLength={100}
        value={draft.title}
        onChangeText={(title) => setDraft({ ...draft, title })}
        style={styles.title}
      />
      {draft.entries.length ? <Segments total={draft.entries.length} done={done} /> : null}
      {!draft.editing || draft.entries.length > 1 ? (
        <Row style={styles.wrap}>
          {draft.editing ? null : <Chip title={dayLabel(draft.date)} active={pickingDate} onPress={() => setPickingDate(!pickingDate)} />}
          {draft.entries.length > 1 ? (
            <Chip title={reordering ? 'Done reordering' : 'Reorder'} active={reordering} onPress={() => {
              setOpenId(null);
              setReordering(!reordering);
            }} />
          ) : null}
        </Row>
      ) : null}
      {pickingDate ? (
        <>
          <Muted>Forgot to log one? Pick the day you trained.</Muted>
          <Row style={styles.wrap}>
            {backfillDates().map((date) => (
              <Chip key={date} title={dayLabel(date)} active={date === draft.date} onPress={() => {
                setDraft({ ...draft, date });
                setPickingDate(false);
              }} />
            ))}
          </Row>
        </>
      ) : null}
      {draft.entries.map((entry, position) => {
        const open = openId === entry.id;
        if (reordering) {
          return (
            <Card key={entry.id} style={entry.done ? styles.done : undefined}>
              <Row>
                <Text style={[styles.name, styles.flex]}>{entry.name}</Text>
                <MoveButtons
                  name={entry.name}
                  index={position}
                  total={draft.entries.length}
                  onMove={(delta) => setDraft({ ...draft, entries: moveItem(draft.entries, position, delta) })}
                />
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
              <Editor
                entry={entry}
                date={draft.date}
                onChange={(changes) => update(entry.id, changes)}
                onRemove={() => setDraft({ ...draft, entries: draft.entries.filter((item) => item.id !== entry.id) })}
              />
            ) : null}
          </Card>
        );
      })}
      <Label>Add exercise</Label>
      <Row>
        <TextInput
          accessibilityLabel="Exercise name"
          placeholder="Cable curls"
          placeholderTextColor={colors.ink3}
          maxLength={100}
          value={newName}
          onChangeText={setNewName}
          onSubmitEditing={() => add(newName)}
          returnKeyType="done"
          style={styles.addInput}
        />
        <Button title="Add" variant="ghost" disabled={!newName.trim()} onPress={() => add(newName)} />
      </Row>
      {suggestions.length ? (
        <Row style={styles.wrap}>
          {suggestions.map((name) => <Chip key={name} title={name} onPress={() => add(name)} />)}
        </Row>
      ) : null}
      <Button title="Discard" variant="danger" onPress={discard} />
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
  step: { width: 56, height: 50, borderRadius: radius.md, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontFamily: fonts.display, fontSize: 28, color: colors.volt },
  addInput: { flex: 1, minHeight: 52, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: space.md, color: colors.ink, fontFamily: fonts.body, fontSize: 16 },
});
