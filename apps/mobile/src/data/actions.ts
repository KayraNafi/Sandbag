import { believableSet, cleanText, loggedWorkoutSchema, savedWorkoutSchema, voice, type LoggedWorkout, type SavedExercise, type SavedWorkout, type StarterWorkout } from '@sandbag/shared';
import { randomUUID } from 'expo-crypto';
import { today } from '@/domain/format';
import { activeLogged, buildHistory, draftEntryFor, lastLogged, rowsFrom, rowsOf, toEntry, trustedEntry, type Draft, type DraftEntry } from '@/domain/history';
import { num, round2 } from '@/domain/format';
import { nextPosition, useData } from './store';

/** Left running overnight isn't a workout. */
const MAX_SESSION_SECONDS = 6 * 60 * 60;

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
  const index = history();
  useData.getState().setDraft({
    id: newId(), date: today(), title: workout.title, savedWorkoutId: workout.savedWorkoutId, editing: false, startedAt: Date.now(),
    // A joke isn't a number to start from next time, so that lift starts from the last real one.
    entries: workout.entries.map((logged) => {
      const entry = trustedEntry(logged);
      if (!entry) return draftEntryFor(index, { name: logged.name, kind: logged.kind, sets: null, reps: null }, newId);
      return { ...entry, id: newId(), rpe: null, note: '', done: false, rows: rowsFrom(entry) };
    }),
  });
}

export function startEdit(workout: LoggedWorkout): void {
  useData.getState().setDraft({
    id: workout.id, date: workout.date, title: workout.title, savedWorkoutId: workout.savedWorkoutId, editing: true, durationSeconds: workout.durationSeconds ?? null,
    entries: workout.entries.map((entry) => ({ ...entry, done: true, rows: rowsFrom(entry, true) })),
  });
}

export function addExerciseToDraft(draft: Draft, name: string): Draft {
  const exercise: SavedExercise = { name: cleanText(name), kind: 'strength', sets: null, reps: null };
  return { ...draft, entries: [...draft.entries, draftEntryFor(history(), exercise, newId)] };
}

/** The line that shows when a lift is ticked off. Null when there's nothing to say. */
export function reactionTo(entry: DraftEntry, date: string): string | null {
  const rows = rowsOf(entry).filter((row) => row.done && row.weight !== null);
  if (entry.kind !== 'strength' || !rows.length) return null;
  const weights = rows.filter((row) => believableSet(entry, row.weight!, row.reps)).map((row) => row.weight!);
  if (!weights.length) return voice.noWay(num(Math.max(...rows.map((row) => row.weight!))), Date.now());
  const top = Math.max(...weights);
  const previous = lastLogged(history(), entry.name, date)?.weight ?? null;
  if (previous === null) return null;
  if (top > previous) return voice.weightUp(num(round2(top - previous)), Date.now());
  if (top < previous) return voice.weightDown(Date.now());
  return voice.sameWeight(num(top), Date.now());
}

/** Validated here against the API's schema, so one bad value can't block every later sync. */
export function finishDraft(draft: Draft): LoggedWorkout {
  const entries = draft.entries.filter((entry) => entry.done).map(toEntry);
  const doc = loggedWorkoutSchema.parse({
    id: draft.id, date: draft.date, title: cleanText(draft.title) || 'Workout', savedWorkoutId: draft.savedWorkoutId,
    entries, updatedAt: Date.now(), deleted: false,
    durationSeconds: draft.startedAt && !draft.editing ? Math.min(Math.round((Date.now() - draft.startedAt) / 1000), MAX_SESSION_SECONDS) : draft.durationSeconds ?? null,
  });
  const { putLogged, setDraft } = useData.getState();
  putLogged(doc);
  setDraft(null);
  return doc;
}

export function deleteLogged(workout: LoggedWorkout): void {
  useData.getState().putLogged({ ...workout, deleted: true });
}

/** A ready-made first workout, so nobody has to invent one before they've lifted anything. */
export function createFromStarter(starter: StarterWorkout): SavedWorkout {
  return createSaved(starter.name, starter.exercises.map((name) => ({ name, kind: 'strength', sets: 3, reps: 8 })));
}

export function createSaved(name: string, exercises: SavedExercise[]): SavedWorkout {
  const { saved, putSaved } = useData.getState();
  const doc = savedWorkoutSchema.parse({
    id: newId(), name: cleanText(name).slice(0, 40), position: nextPosition(saved), exercises, savedFrom: null, updatedAt: Date.now(), deleted: false,
  });
  putSaved(doc);
  return doc;
}

export function updateSaved(workout: SavedWorkout, changes: Partial<Pick<SavedWorkout, 'name' | 'exercises'>>): void {
  const doc = savedWorkoutSchema.parse({ ...workout, ...changes, name: cleanText(changes.name ?? workout.name).slice(0, 40), updatedAt: Date.now() });
  useData.getState().putSaved(doc);
}

export function deleteSaved(workout: SavedWorkout): void {
  useData.getState().putSaved({ ...workout, deleted: true });
}

/** List order is the rotation, so moving one is a swap of two positions. */
