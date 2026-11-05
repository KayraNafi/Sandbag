import { exerciseKey, voice } from '@sandbag/shared';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';
import { confirm } from '@/components/confirm';
import { feel } from '@/components/motion';
import { toast } from '@/components/Toast';
import { Button, Chip, Label, Row } from '@/components/ui';
import { addExerciseToDraft, finishDraft } from '@/data/actions';
import { useData } from '@/data/store';
import { activeLogged, buildHistory, moveTo, type Draft, type DraftEntry } from '@/domain/history';
import { leave } from '@/nav';
import { colors, fonts, radius, space } from '@/theme';

/** What both logging layouts do to a workout. They differ only in how it's shown. */
export function useWorkout(draft: Draft) {
  const setDraft = useData((state) => state.setDraft);
  const entries = draft.entries;
  return {
    done: entries.filter((entry) => entry.done).length,
    update: (id: string, changes: Partial<DraftEntry>) =>
      setDraft({ ...draft, entries: entries.map((entry) => (entry.id === id ? { ...entry, ...changes } : entry)) }),
    remove: (id: string) => setDraft({ ...draft, entries: entries.filter((entry) => entry.id !== id) }),
    move: (from: number, to: number) => setDraft({ ...draft, entries: moveTo(entries, from, to) }),
    rename: (title: string) => setDraft({ ...draft, title }),
    redate: (date: string) => setDraft({ ...draft, date }),
    /** Returns the new lift's id. */
    add: (name: string): string | null => {
      if (!name.trim()) return null;
      const next = addExerciseToDraft(draft, name);
      setDraft(next);
      return next.entries.at(-1)?.id ?? null;
    },
    finish: () => {
      if (!entries.some((entry) => entry.done)) {
        toast('Nothing’s ticked. Bold way to log a workout.');
        return;
      }
      feel.win();
      const workout = finishDraft(draft);
      router.replace(`/workout/finished?id=${workout.id}`);
    },
    discard: async () => {
      const message = draft.editing ? 'Your changes will be lost. The logged session stays.' : voice.discard();
      if (await confirm('Discard this workout?', message, 'Discard')) {
        setDraft(null);
        leave();
      }
    },
  };
}

/** A lift by name, with the ones done before offered first. */
export function AddLift({ draft, onAdd }: { draft: Draft; onAdd: (name: string) => void }) {
  const logged = useData((state) => state.logged);
  const [name, setName] = useState('');
  const known = useMemo(() => [...buildHistory(activeLogged(logged)).values()].map((item) => item.name), [logged]);
  const query = exerciseKey(name);
  const inDraft = new Set(draft.entries.map((entry) => exerciseKey(entry.name)));
  const suggestions = known
    .filter((item) => !inDraft.has(exerciseKey(item)) && (!query || exerciseKey(item).includes(query)))
    .slice(0, 6);
  const add = (value: string) => {
    if (!value.trim()) return;
    onAdd(value);
    setName('');
  };
  return (
    <>
      <Label>Add exercise</Label>
      <Row>
        <TextInput
          accessibilityLabel="Exercise name"
          placeholder="Cable curls"
          placeholderTextColor={colors.ink3}
          maxLength={100}
          value={name}
          onChangeText={setName}
          onSubmitEditing={() => add(name)}
          returnKeyType="done"
          style={styles.input}
        />
        <Button title="Add" variant="ghost" disabled={!name.trim()} onPress={() => add(name)} />
      </Row>
      {suggestions.length ? (
        <Row style={styles.wrap}>
          {suggestions.map((item) => <Chip key={item} title={item} onPress={() => add(item)} />)}
        </Row>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { flexWrap: 'wrap' },
  input: { flex: 1, minHeight: 52, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: space.md, color: colors.ink, fontFamily: fonts.body, fontSize: 16 },
});
