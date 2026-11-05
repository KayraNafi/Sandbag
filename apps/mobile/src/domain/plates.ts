import type { Entry, Kit } from '@sandbag/shared';

const PLATES = [25, 20, 15, 10, 5, 2.5, 1.25];
const BAR_KG = 20;

/** The plates on one side, heaviest first, for a total that includes the bar. */
export function platesFor(total: number, bar = BAR_KG): number[] {
  let left = Math.max(0, total - bar) / 2;
  const plates: number[] = [];
  for (const plate of PLATES) {
    while (left >= plate) {
      plates.push(plate);
      left -= plate;
    }
  }
  return plates;
}

/** What to load, for someone standing at the rack: "EACH SIDE 2 × 20 + 2.5", or null below an empty bar. */
export function plateWords(total: number, bar = BAR_KG): string | null {
  if (total < bar) return null;
  const plates = platesFor(total, bar);
  if (!plates.length) return total === bar ? 'JUST THE BAR' : null;
  const counts = new Map<number, number>();
  for (const plate of plates) counts.set(plate, (counts.get(plate) ?? 0) + 1);
  const parts = [...counts].map(([plate, count]) => (count > 1 ? `${count} × ${plate}` : String(plate)));
  const exact = plates.reduce((sum, plate) => sum + plate, 0) * 2 + bar === total;
  return `${exact ? '' : 'ABOUT '}EACH SIDE ${parts.join(' + ')}`;
}

/** What a weight looks like on the kit: plates on a bar, a dumbbell or a machine's sled, or a pin in a stack. */
export type Load =
  | { kind: 'plates'; plates: number[]; words: string | null; handle: 'bar' | 'dumbbell' }
  | { kind: 'stack'; weight: number };

export function loadOf(weight: number | null, kit: Kit, setup: Pick<Entry, 'perSide' | 'includesEquipment'>): Load | null {
  if (!weight || weight <= 0 || kit === 'bodyweight') return null;
  if (kit === 'machine' || kit === 'cable') return { kind: 'stack', weight };
  // Plates go on in pairs, a dumbbell's two ends included, so the plates on one side are half the total.
  if (kit === 'dumbbell') return { kind: 'plates', plates: platesFor(weight, 0), words: null, handle: 'dumbbell' };
  const total = setup.perSide ? weight * 2 : weight;
  // A machine's sled isn't counted, and neither is a bar the number leaves out.
  const bar = kit === 'barbell' && !setup.perSide && setup.includesEquipment !== false ? BAR_KG : 0;
  return { kind: 'plates', plates: platesFor(total, bar), words: plateWords(total, bar), handle: 'bar' };
}
