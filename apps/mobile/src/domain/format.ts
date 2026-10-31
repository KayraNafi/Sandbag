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

export const round2 = (value: number) => Math.round(value * 100) / 100;
export const num = (value: number) => String(round2(value));
export const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;
export const signed = (value: number) => `${value > 0 ? '+' : ''}${value}%`;

export function setsReps(entry: Pick<Entry, 'sets' | 'reps'>): string {
  if (entry.sets && entry.reps) return `${entry.sets} × ${entry.reps}`;
  if (entry.sets) return plural(entry.sets, 'set');
  if (entry.reps) return plural(entry.reps, 'rep');
  return '';
}

export function summary(entry: Entry): string {
  if (entry.kind === 'time') return entry.minutes ? `${num(entry.minutes)} min` : 'No time logged';
  const parts: string[] = [];
  if (entry.weight !== null) parts.push(`${num(entry.weight)} kg${entry.perSide ? ' each side' : ''}`);
  const sr = setsReps(entry);
  if (sr) parts.push(sr);
  if (entry.rpe) parts.push(`RPE ${num(entry.rpe)}`);
  return parts.join(' · ') || 'No numbers logged';
}
