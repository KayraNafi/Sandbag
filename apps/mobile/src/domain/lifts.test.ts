import { describe, expect, it } from 'vitest';
import { liftChoices } from './lifts';

const none = { query: '', muscle: null, kit: null, known: [], exclude: [] };
const names = (input: Partial<Parameters<typeof liftChoices>[0]>) => liftChoices({ ...none, ...input }).choices.map((choice) => choice.name);

describe('the lift picker', () => {
  it('offers your name for a lift you already log, first', () => {
    expect(names({ query: 'calf', known: ['Calf Raises'] })).toEqual(['Calf Raises', 'Seated calf raise']);
  });

  it('offers your own lifts when they match what you type', () => {
    expect(names({ query: 'zercher', known: ['Zercher squat', 'Bench press'] })).toEqual(['Zercher squat']);
    expect(names({ query: 'zercher', muscle: 'quads', known: ['Zercher squat'] })).toEqual([]);
  });

  it('leaves out what is already in the workout', () => {
    expect(names({ query: 'calf', known: ['Calf Raises'], exclude: ['calf raises'] })).toEqual(['Seated calf raise']);
  });

  it('puts a muscle’s own lifts before the ones that only help it', () => {
    const triceps = names({ muscle: 'triceps' });
    expect(triceps.indexOf('Triceps pushdown')).toBeLessThan(triceps.indexOf('Bench press'));
    expect(names({ muscle: 'calves', kit: 'machine' })).toEqual(['Standing calf raise', 'Seated calf raise']);
  });

  it('suggests what a typo meant without changing it', () => {
    const typo = liftChoices({ ...none, query: 'Hummer Curls' });
    expect(typo.meant?.name).toBe('Hammer curl');
    expect(typo.typedIsOffered).toBe(false);
  });

  it('suggests nothing for a name you log already, even a misspelt one', () => {
    expect(liftChoices({ ...none, query: 'Hummer Curls', known: ['Hummer Curls'] }).meant).toBeUndefined();
  });

  it('knows when the typed name is already on offer', () => {
    expect(liftChoices({ ...none, query: 'leg press' }).typedIsOffered).toBe(true);
    expect(liftChoices({ ...none, query: 'leg pre' }).typedIsOffered).toBe(false);
  });
});
