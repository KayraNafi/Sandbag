import { loggedWorkoutSchema, runSchema, savedWorkoutSchema, voice, type Entry, type LoggedWorkout, type Run, type SavedExercise, type SavedWorkout } from '@sandbag/shared';
import { randomUUID } from 'expo-crypto';
import { today } from '@/domain/format';
import { activeLogged, buildHistory, draftEntryFor, lastLogged, type Draft, type DraftEntry } from '@/domain/history';
import { num, round2 } from '@/domain/format';
import { toEntry } from '@/domain/sets';
import { nextPosition, useData } from './store';

export const newId = () => randomUUID();

function history() {
  return buildHistory(activeLogged(useData.getState().logged));
}

export function startFromSaved(workout: SavedWorkout): void {
  const index = history();
  useData.getState().setDraft({
    id: newId(), date: today(), title: workout.name, savedWorkoutId: workout.id, editing: false, startedAt: Date.now(),
    entries: workout.exercises.map((exercise) => draftEntryFor(index, exercise, newId)),
  });
}

export function startBlank(): void {
  useData.getState().setDraft({ id: newId(), date: today(), title: 'Workout', savedWorkoutId: null, editing: false, startedAt: Date.now(), entries: [] });
}

export function startRepeat(workout: LoggedWorkout): void {
  useData.getState().setDraft({
    id: newId(), date: today(), title: workout.title, savedWorkoutId: workout.savedWorkoutId, editing: false, startedAt: Date.now(),
    entries: workout.entries.map((entry) => ({ ...entry, id: newId(), done: false })),
  });
}

export function startEdit(workout: LoggedWorkout): void {
  useData.getState().setDraft({
    id: workout.id, date: workout.date, title: workout.title, savedWorkoutId: workout.savedWorkoutId, editing: true,
    entries: workout.entries.map((entry) => ({ ...entry, done: true })),
  });
}

export function addExerciseToDraft(draft: Draft, name: string): Draft {
  const exercise: SavedExercise = { name: name.trim(), kind: 'strength', sets: null, reps: null };
  return { ...draft, entries: [...draft.entries, draftEntryFor(history(), exercise, newId)] };
}

/** The line that shows when a lift is ticked off. Null when there's nothing to say. */
export function reactionTo(entry: DraftEntry, date: string): string | null {
  if (entry.rpe === 10) return voice.rpeTen();
  if (entry.kind !== 'strength' || entry.weight === null) return null;
  const previous = lastLogged(history(), entry.name, date)?.weight ?? null;
  if (previous === null) return null;
  if (entry.weight > previous) return voice.weightUp(num(round2(entry.weight - previous)));
  if (entry.weight < previous) return voice.weightDown();
  return voice.sameWeight(num(entry.weight));
}

/** Validated here against the API's schema, so one bad value can't block every later sync. */
export function finishDraft(draft: Draft): LoggedWorkout {
  const entries: Entry[] = draft.entries
    .filter((entry) => entry.done)
    .map(toEntry);
  const doc = loggedWorkoutSchema.parse({
    id: draft.id, date: draft.date, title: draft.title.trim() || 'Workout', savedWorkoutId: draft.savedWorkoutId,
    entries, updatedAt: Date.now(), deleted: false,
  });
  const { putLogged, setDraft } = useData.getState();
  putLogged(doc);
  setDraft(null);
  return doc;
}

/** Returns how to take it back. */
export function deleteLogged(workout: LoggedWorkout): () => void {
  useData.getState().putLogged({ ...workout, deleted: true });
  return () => useData.getState().putLogged({ ...workout, deleted: false });
}

export function createSaved(name: string, exercises: SavedExercise[]): SavedWorkout {
  const { saved, putSaved } = useData.getState();
  const doc = savedWorkoutSchema.parse({
    id: newId(), name: name.trim().slice(0, 40), position: nextPosition(saved), exercises, savedFrom: null, updatedAt: Date.now(), deleted: false,
  });
  putSaved(doc);
  return doc;
}

export function updateSaved(workout: SavedWorkout, changes: Partial<Pick<SavedWorkout, 'name' | 'exercises'>>): void {
  const doc = savedWorkoutSchema.parse({ ...workout, ...changes, name: (changes.name ?? workout.name).trim().slice(0, 40), updatedAt: Date.now() });
  useData.getState().putSaved(doc);
}

/** Returns how to take it back. */
export function deleteSaved(workout: SavedWorkout): () => void {
  useData.getState().putSaved({ ...workout, deleted: true });
  return () => useData.getState().putSaved({ ...workout, deleted: false });
}

/** List order is the rotation, so moving one is a swap of two positions. */
export function moveSaved(list: SavedWorkout[], index: number, direction: -1 | 1): void {
  const a = list[index];
  const b = list[index + direction];
  if (!a || !b) return;
  const { putSaved } = useData.getState();
  putSaved({ ...a, position: b.position });
  putSaved({ ...b, position: a.position });
}

/** Saves a new run or an edit of one. Validated here, as a workout is, so one bad value can't block every later sync. */
export function saveRun(fields: Omit<Run, 'id' | 'updatedAt' | 'deleted'>, id: string = newId()): Run {
  const doc = runSchema.parse({ ...fields, id, note: fields.note.trim(), updatedAt: Date.now(), deleted: false });
  useData.getState().putRun(doc);
  return doc;
}

/** Returns how to take it back. */
export function deleteRun(run: Run): () => void {
  useData.getState().putRun({ ...run, deleted: true });
  return () => useData.getState().putRun({ ...run, deleted: false });
}
