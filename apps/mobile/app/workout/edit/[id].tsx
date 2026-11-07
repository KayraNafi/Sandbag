import { keepSupersets, type SavedExercise } from '@sandbag/shared';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { LiftPicker } from '@/components/LiftPicker';
import { SupersetList } from '@/components/Superset';
import { Button, Card, Chip, Field, MoveButtons, Muted, NumberField, Row, Screen } from '@/components/ui';
import { leave } from '@/nav';
import { createSaved, updateSaved } from '@/data/actions';
import { useData } from '@/data/store';
import { moveItem } from '@/domain/history';
import { colors, fonts } from '@/theme';

const NAME_MAX = 40;

export default function EditSavedWorkout() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const existing = useData((state) => (id && id !== 'new' ? state.saved[id] : undefined));
  const [name, setName] = useState(existing?.name ?? '');
  const [exercises, setExercises] = useState<SavedExercise[]>(existing?.exercises ?? []);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string>();

  const add = (name: string) => {
    setExercises((current) => [...current, { name, kind: 'strength', sets: null, reps: null }]);
    setPicking(false);
  };
  const change = (index: number, changes: Partial<SavedExercise>) =>
    setExercises((current) => current.map((item, position) => (position === index ? { ...item, ...changes } : item)));

  const save = () => {
    if (!name.trim()) {
      setError('Give it a name. “Upper” will do.');
      return;
    }
    if (existing) updateSaved(existing, { name, exercises });
    else createSaved(name, exercises);
    leave();
  };

  return (
    <Screen padTop={false} footer={<Button title="Save workout" onPress={save} />}>
      <Field label="Name" placeholder="Upper" maxLength={NAME_MAX} value={name} onChangeText={setName} error={error} />
      {exercises.length ? <Muted>Your latest numbers load automatically. Sets and reps here only apply until you’ve logged a lift.</Muted> : null}
      <SupersetList items={exercises} keyOf={(exercise) => `${exercise.name}-${exercises.indexOf(exercise)}`} onLink={(at, on) => change(at, { supersetWithNext: on || undefined })}>{(exercise) => {
        const index = exercises.indexOf(exercise);
        return (
          <Card>
            <Row>
              <Text style={styles.name}>{exercise.name}</Text>
              <MoveButtons name={exercise.name} index={index} total={exercises.length} onMove={(delta) => setExercises((current) => moveItem(current, index, delta))} />
              <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${exercise.name}`} onPress={() => setExercises((current) => keepSupersets(current, (item) => item !== exercise))} style={styles.icon}><Text style={styles.remove}>×</Text></Pressable>
            </Row>
            <Row style={styles.wrap}>
              <Chip title="Weight" active={exercise.kind === 'strength'} onPress={() => change(index, { kind: 'strength' })} />
              <Chip title="Time" active={exercise.kind === 'time'} onPress={() => change(index, { kind: 'time' })} />
            </Row>
            {exercise.kind === 'strength' ? (
              <Row>
                <NumberField label="Sets" decimals={false} value={exercise.sets} max={1000} onChange={(sets) => change(index, { sets })} />
                <NumberField label="Reps" decimals={false} value={exercise.reps} max={1000} onChange={(reps) => change(index, { reps })} />
              </Row>
            ) : null}
          </Card>
        );
      }}</SupersetList>
      <Button title="Add exercise" variant="ghost" onPress={() => setPicking(true)} />
      <LiftPicker visible={picking} onClose={() => setPicking(false)} exclude={exercises.map((item) => item.name)} onPick={add} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  name: { flex: 1, fontFamily: fonts.bodyStrong, fontSize: 16, color: colors.ink },
  icon: { width: 44, height: 44, borderRadius: 10, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  remove: { color: colors.danger, fontSize: 22 },
  wrap: { flexWrap: 'wrap' },
});
