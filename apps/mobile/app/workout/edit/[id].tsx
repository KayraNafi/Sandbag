import type { SavedExercise } from '@sandbag/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, Card, Chip, Field, Label, MoveButtons, Muted, NumberField, Row, Screen } from '@/components/ui';
import { createSaved, updateSaved } from '@/data/actions';
import { useData } from '@/data/store';
import { activeLogged, buildHistory, moveItem } from '@/domain/history';
import { exerciseKey } from '@sandbag/shared';
import { colors, fonts, radius, space } from '@/theme';

const NAME_MAX = 40;

export default function EditSavedWorkout() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const existing = useData((state) => (id && id !== 'new' ? state.saved[id] : undefined));
  const logged = useData((state) => state.logged);
  const [name, setName] = useState(existing?.name ?? '');
  const [exercises, setExercises] = useState<SavedExercise[]>(existing?.exercises ?? []);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string>();
  const known = useMemo(() => [...buildHistory(activeLogged(logged)).values()].map((item) => item.name), [logged]);

  const add = (raw: string) => {
    const value = raw.trim();
    if (!value) return;
    setExercises((current) => [...current, { name: value, kind: 'strength', sets: null, reps: null }]);
    setNewName('');
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
    router.back();
  };

  const query = exerciseKey(newName);
  const used = new Set(exercises.map((item) => exerciseKey(item.name)));
  const suggestions = known.filter((item) => !used.has(exerciseKey(item)) && (!query || exerciseKey(item).includes(query))).slice(0, 8);

  return (
    <Screen padTop={false} footer={<Button title="Save workout" onPress={save} />}>
      <Field label="Name" placeholder="Upper" maxLength={NAME_MAX} value={name} onChangeText={setName} error={error} />
      {exercises.length ? <Muted>Your latest numbers load automatically. Sets and reps here only apply until you’ve logged a lift.</Muted> : null}
      {exercises.map((exercise, index) => (
        <Card key={`${exercise.name}-${index}`}>
          <Row>
            <Text style={styles.name}>{exercise.name}</Text>
            <MoveButtons name={exercise.name} index={index} total={exercises.length} onMove={(delta) => setExercises((current) => moveItem(current, index, delta))} />
            <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${exercise.name}`} onPress={() => setExercises((current) => current.filter((_, position) => position !== index))} style={styles.icon}><Text style={styles.remove}>×</Text></Pressable>
          </Row>
          <Row>
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
      ))}
      <Label>Add exercise</Label>
      <View style={styles.addRow}>
        <TextInput
          accessibilityLabel="Exercise name"
          placeholder="Lat pulldown"
          placeholderTextColor={colors.ink3}
          maxLength={100}
          value={newName}
          onChangeText={setNewName}
          onSubmitEditing={() => add(newName)}
          returnKeyType="done"
          style={styles.input}
        />
        <Button title="Add" variant="ghost" disabled={!newName.trim()} onPress={() => add(newName)} />
      </View>
      {suggestions.length ? (
        <Row style={styles.wrap}>
          {suggestions.map((item) => <Chip key={item} title={item} onPress={() => add(item)} />)}
        </Row>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  name: { flex: 1, fontFamily: fonts.bodyStrong, fontSize: 16, color: colors.ink },
  icon: { width: 40, height: 40, borderRadius: 10, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  remove: { color: colors.danger, fontSize: 22 },
  addRow: { flexDirection: 'row', gap: space.sm },
  input: { flex: 1, minHeight: 52, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: space.md, color: colors.ink, fontFamily: fonts.body, fontSize: 16 },
  wrap: { flexWrap: 'wrap' },
});
