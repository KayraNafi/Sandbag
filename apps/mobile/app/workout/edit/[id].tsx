import { cleanText, type SavedExercise } from '@sandbag/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';
import { ExercisePicker } from '@/components/ExercisePicker';
import { LiftRow } from '@/components/LiftRow';
import { Sheet } from '@/components/Sheet';
import { Button, Card, Field, MoveButtons, Muted, NumberField, Row, Screen, Segmented, ShowMore, useShowMore } from '@/components/ui';
import { createSaved, updateSaved } from '@/data/actions';
import { useData } from '@/data/store';
import { activeLogged, buildHistory, moveItem } from '@/domain/history';

const NAME_MAX = 40;
const KINDS: { key: SavedExercise['kind']; label: string }[] = [{ key: 'strength', label: 'Weight' }, { key: 'time', label: 'Time' }];

export default function EditSavedWorkout() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const existing = useData((state) => (id && id !== 'new' ? state.saved[id] : undefined));
  const logged = useData((state) => state.logged);
  const [name, setName] = useState(existing?.name ?? '');
  const [exercises, setExercises] = useState<SavedExercise[]>(existing?.exercises ?? []);
  const [picking, setPicking] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const current = open === null ? undefined : exercises[open];
  const list = useShowMore(exercises.length, 20);
  const [error, setError] = useState<string>();
  const known = useMemo(() => [...buildHistory(activeLogged(logged)).values()].map((item) => item.name), [logged]);

  const add = (raw: string) => {
    const value = cleanText(raw);
    if (!value) return;
    setExercises((current) => [...current, { name: value, kind: 'strength', sets: null, reps: null }]);
    setPicking(false);
  };
  const change = (index: number, changes: Partial<SavedExercise>) =>
    setExercises((current) => current.map((item, position) => (position === index ? { ...item, ...changes } : item)));

  const save = () => {
    if (!cleanText(name)) {
      setError('Give it a name. “Upper” will do.');
      return;
    }
    if (existing) updateSaved(existing, { name, exercises });
    else createSaved(name, exercises);
    router.back();
  };

  return (
    <Screen padTop={false} footer={<Button title="Save workout" onPress={save} />}>
      <Field label="Name" placeholder="Upper" maxLength={NAME_MAX} value={name} onChangeText={setName} error={error} />
      {exercises.length ? <Muted>Your latest numbers load automatically. Sets and reps here only apply until you’ve logged a lift.</Muted> : null}
      {exercises.length ? (
        <Card>
          {exercises.slice(0, list.shown).map((exercise, index) => (
            <LiftRow
              key={`${exercise.name}-${index}`}
              name={exercise.name}
              delay={Math.min(index, 8) * 40}
              detail={exercise.kind === 'time' ? 'Timed' : exercise.sets || exercise.reps ? `${exercise.sets ?? '–'} × ${exercise.reps ?? '–'}` : 'Numbers come from your history'}
              onPress={() => setOpen(index)}
            />
          ))}
        </Card>
      ) : null}
      <ShowMore left={list.left} page={list.page} onPress={list.more} />
      <Button title="Add a lift" variant="ghost" onPress={() => setPicking(true)} />
      <Sheet visible={Boolean(current)} onClose={() => setOpen(null)} title={current?.name ?? ''} footer={<Button title="Done" onPress={() => setOpen(null)} />}>
        {current && open !== null ? (
          <>
            <Segmented options={KINDS} value={current.kind} onChange={(kind) => change(open, { kind })} />
            {current.kind === 'strength' ? (
              <Row>
                <NumberField label="Sets" decimals={false} value={current.sets} max={1000} onChange={(sets) => change(open, { sets })} />
                <NumberField label="Reps" decimals={false} value={current.reps} max={1000} onChange={(reps) => change(open, { reps })} />
              </Row>
            ) : null}
            <Row style={styles.order}>
              <Muted>Lift {open + 1} of {exercises.length}</Muted>
              <MoveButtons name={current.name} index={open} total={exercises.length} onMove={(delta) => {
                setExercises((list_) => moveItem(list_, open, delta));
                setOpen(open + delta);
              }} />
            </Row>
            <Button title="Remove from this workout" variant="danger" onPress={() => {
              setExercises((list_) => list_.filter((_, position) => position !== open));
              setOpen(null);
            }} />
          </>
        ) : null}
      </Sheet>
      <ExercisePicker visible={picking} recent={known} exclude={new Set(exercises.map((item) => item.name))} onPick={add} onClose={() => setPicking(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  order: { justifyContent: 'space-between' },
});
