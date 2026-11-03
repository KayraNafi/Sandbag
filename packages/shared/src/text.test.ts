import { describe, expect, it } from 'vitest';
import { createReplySchema, loggedWorkoutSchema, registerSchema } from './schemas';
import { cleanText } from './text';

describe('cleanText', () => {
  it('leaves normal names alone, in any language', () => {
    for (const name of ['Big Lad', 'أحمد العربي', 'مُحَمَّد', 'می‌خواهم', '🏋️ Big Lad 💪', '👨‍👩‍👧', '<script>alert(1)</script>', "Robert'); DROP TABLE users;--"]) expect(cleanText(name)).toBe(name);
  });

  it('removes direction overrides and hidden characters', () => {
    expect(cleanText('nimda‮')).toBe('nimda');
    expect(cleanText('a​b\u0000c')).toBe('abc');
  });

  it('calms zalgo down without breaking the word', () => {
    expect(cleanText('á̂̃̄̅̆̇b')).toBe('á̂̃b');
  });

  it('puts everything on one line', () => {
    expect(cleanText(`one${'\n'.repeat(140)}two   three\t`)).toBe('one two three');
  });

  it('has nothing to say about text with nothing in it', () => {
    for (const blank of ['', '   ', '​​', '‍', '́̂', '\n\n']) expect(cleanText(blank)).toBe('');
  });
});

describe('the schemas clean what they take in', () => {
  const account = { username: 'someone', password: 'long enough password', inviteCode: 'code' };
  const workout = { id: 'a', date: '2026-11-03', title: 'x', savedWorkoutId: null, entries: [], updatedAt: 1, deleted: false };
  const entry = { id: 'e', name: 'Squat', kind: 'strength', sets: 3, reps: 5, weight: 100, perSide: false, rpe: null, minutes: null, note: '' };

  it('refuses a name with nothing visible in it', () => {
    expect(registerSchema.safeParse({ ...account, displayName: '​​' }).success).toBe(false);
    expect(createReplySchema.safeParse({ text: '​' }).success).toBe(false);
    expect(loggedWorkoutSchema.safeParse({ ...workout, title: '‮' }).success).toBe(false);
  });

  it('stores the cleaned text', () => {
    expect(registerSchema.parse({ ...account, displayName: ' Big‮ Lad ' }).displayName).toBe('Big Lad');
    expect(loggedWorkoutSchema.parse({ ...workout, entries: [{ ...entry, name: 'Squat​', note: 'felt\nheavy' }] }).entries[0]).toMatchObject({ name: 'Squat', note: 'felt heavy' });
  });

  it('still allows an empty note', () => {
    expect(loggedWorkoutSchema.parse({ ...workout, entries: [entry] }).entries[0]?.note).toBe('');
  });
});
