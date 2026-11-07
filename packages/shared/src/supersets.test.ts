import { describe, expect, it } from 'vitest';
import { keepSupersets, supersetGroups } from './supersets';

const lift = (name: string, supersetWithNext?: boolean) => ({ name, ...(supersetWithNext ? { supersetWithNext } : {}) });
const names = (groups: { name: string }[][]) => groups.map((group) => group.map((item) => item.name));

describe('supersets', () => {
  it('groups each marked lift with the one after it', () => {
    expect(names(supersetGroups([lift('A', true), lift('B'), lift('C')]))).toEqual([['A', 'B'], ['C']]);
    expect(names(supersetGroups([lift('A', true), lift('B', true), lift('C'), lift('D')]))).toEqual([['A', 'B', 'C'], ['D']]);
  });

  it('ignores a mark on the last lift', () => {
    expect(names(supersetGroups([lift('A'), lift('B', true)]))).toEqual([['A'], ['B']]);
  });

  it('keeps pairs together when lifts are left out', () => {
    const items = [lift('A', true), lift('B', true), lift('C'), lift('D')];
    expect(keepSupersets(items, (item) => item.name !== 'B')).toEqual([lift('A', true), lift('C'), lift('D')]);
  });

  it('unmarks a lift whose partner was left out, so it never joins the next lift', () => {
    const items = [lift('A', true), lift('B'), lift('C')];
    expect(keepSupersets(items, (item) => item.name !== 'B')).toEqual([lift('A'), lift('C')]);
  });

  it('drops a mark left on the last lift', () => {
    expect(keepSupersets([lift('A'), lift('B', true)], () => true)).toEqual([lift('A'), lift('B')]);
  });
});
