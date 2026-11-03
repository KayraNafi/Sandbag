import type { Entry } from '@sandbag/shared';

const pad = (value: number) => String(value).padStart(2, '0');

export const toIsoDate = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
export const today = () => toIsoDate(new Date());

function parseIso(iso: string): Date {
  const [year = 1970, month = 1, day = 1] = iso.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export const formatDate = (iso: string) => parseIso(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
export const formatLongDate = (iso: string) =>
  parseIso(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

const BACKFILL_DAYS = 7;

/** The days a workout can be logged for, newest first: today and the week before it. */
export function backfillDates(from: string = today()): string[] {
  const start = parseIso(from);
  return Array.from({ length: BACKFILL_DAYS + 1 }, (_, back) =>
    toIsoDate(new Date(start.getFullYear(), start.getMonth(), start.getDate() - back)));
}

export function dayLabel(iso: string, from: string = today()): string {
  const [current, yesterday] = backfillDates(from);
  if (iso === current) return 'Today';
  if (iso === yesterday) return 'Yesterday';
  return parseIso(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function agoText(iso: string): string {
  const days = Math.round((parseIso(today()).getTime() - parseIso(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

export function agoShort(isoTime: string): string {
  const minutes = Math.round((Date.now() - Date.parse(isoTime)) / 60_000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${Math.round(minutes / 60)}h`;
  return `${Math.round(minutes / 1440)}d`;
}

export const agoLong = (isoTime: string) => {
  const short = agoShort(isoTime);
  return short === 'now' ? 'just now' : `${short} ago`;
};

/** Plain decimals only. `Number` alone would also accept 0x10 and 1e5, which nobody means. */
const typedNumber = (text: string) => (/^\d*[.,]?\d*$/.test(text.trim()) ? Number(text.trim().replace(',', '.')) : Number.NaN);

/** Blank or unreadable counts as nothing typed. */
export function parseNumber(text: string, max: number): number | null {
  const value = typedNumber(text);
  if (!text.trim() || !Number.isFinite(value) || value < 0) return null;
  return Math.min(value, max);
}

export const isOverMax = (text: string, max: number) => typedNumber(text) > max;

export const round2 = (value: number) => Math.round(value * 100) / 100;
export const num = (value: number) => String(round2(value));

/** Display type is about this wide per character. */
const DISPLAY_CHAR_WIDTH = 0.56;

/** The biggest size up to `base` at which this many characters fit the width on one line. */
export const fitSize = (base: number, characters: number, width: number) => Math.min(base, Math.floor(width / (Math.max(characters, 1) * DISPLAY_CHAR_WIDTH)));

/** The next stop on a step's grid, so 57.5 with a 5 kg jump goes to 60 or 55, never 62.5. */
export function nudge(value: number, delta: number): number {
  const step = Math.abs(delta);
  const stops = value / step;
  const near = Math.round(stops);
  const from = Math.abs(stops - near) < 1e-6 ? near : delta > 0 ? Math.floor(stops) : Math.ceil(stops);
  return Math.max(0, round2((from + Math.sign(delta)) * step));
}
/** 1st, 2nd, 3rd, 4th, and 11th rather than 11st. */
export function ordinal(place: number): string {
  const tens = place % 100;
  if (tens >= 11 && tens <= 13) return `${place}th`;
  return `${place}${['th', 'st', 'nd', 'rd'][place % 10] ?? 'th'}`;
}

/** How one amount compares to another, without printing +19,900% for going from nothing much to something. */
export function changeWords(now: number, before: number): string | null {
  if (!before) return null;
  const percent = ((now - before) / before) * 100;
  if (percent >= 1000) return `×${Math.round(now / before).toLocaleString('en-US')}`;
  return `${percent >= 0 ? '+' : '−'}${Math.abs(Math.round(percent * 10) / 10)}%`;
}

export const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;
export const signed = (value: number) => `${value > 0 ? '+' : ''}${value}%`;

export function setsReps(entry: Pick<Entry, 'sets' | 'reps' | 'setReps'>): string {
  if (entry.setReps?.length && entry.setReps.length === entry.sets) return entry.setReps.map((reps) => reps ?? '–').join(', ');
  if (entry.sets && entry.reps) return `${entry.sets} × ${entry.reps}`;
  if (entry.sets) return plural(entry.sets, 'set');
  if (entry.reps) return plural(entry.reps, 'rep');
  return '';
}

function equipmentText({ includesEquipment }: Pick<Entry, 'includesEquipment'>): string {
  if (includesEquipment === undefined) return '';
  return includesEquipment ? ' incl. bar/machine' : ' excl. bar/machine';
}

export function summary(entry: Entry): string {
  if (entry.kind === 'time') return entry.minutes ? `${num(entry.minutes)} min` : 'No time logged';
  const parts: string[] = [];
  const weights = entry.setWeights?.length ? entry.setWeights.map((weight) => (weight === null ? '–' : num(weight))).join(', ') : entry.weight !== null ? num(entry.weight) : null;
  if (weights !== null) parts.push(`${weights} kg${entry.perSide ? ' each side' : ''}${equipmentText(entry)}`);
  const sr = setsReps(entry);
  if (sr) parts.push(sr);
  if (entry.rpe) parts.push(`RPE ${num(entry.rpe)}`);
  return parts.join(' · ') || 'No numbers logged';
}

export const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.max(0, seconds) % 60).padStart(2, '0')}`;
