import { describe, expect, it } from 'vitest';
import { mergeDocs } from './merge';

type Doc = { id: string; updatedAt: number; name: string };
const doc = (id: string, updatedAt: number, name: string): Doc => ({ id, updatedAt, name });

describe('mergeDocs', () => {
  it('takes the server’s copy under the same stamp, so a fix made on the server arrives', () => {
    const { docs } = mergeDocs({ a: doc('a', 5, 'Hummer Curls') }, [], [doc('a', 5, 'Hammer curl')], new Map());
    expect(docs.a?.name).toBe('Hammer curl');
  });

  it('takes the server’s copy of what was just sent, and stops sending it', () => {
    const { docs, dirty } = mergeDocs({ a: doc('a', 5, 'Mine') }, ['a'], [doc('a', 5, 'Fixed')], new Map([['a', 5]]));
    expect(docs.a?.name).toBe('Fixed');
    expect(dirty).toEqual([]);
  });

  it('keeps a change still to send, and keeps it queued', () => {
    // Not in this request.
    expect(mergeDocs({ a: doc('a', 5, 'Mine') }, ['a'], [doc('a', 5, 'Server')], new Map())).toEqual({ docs: { a: doc('a', 5, 'Mine') }, dirty: ['a'] });
    // Changed again while the request was in flight.
    const later = mergeDocs({ a: doc('a', 7, 'Newer') }, ['a'], [doc('a', 6, 'Sent')], new Map([['a', 6]]));
    expect(later).toEqual({ docs: { a: doc('a', 7, 'Newer') }, dirty: ['a'] });
  });

  it('takes a newer server copy, and ignores an older one', () => {
    expect(mergeDocs({ a: doc('a', 5, 'Old') }, [], [doc('a', 9, 'New')], new Map()).docs.a?.name).toBe('New');
    expect(mergeDocs({ a: doc('a', 9, 'Mine') }, [], [doc('a', 5, 'Old')], new Map()).docs.a?.name).toBe('Mine');
  });
});
