/** Dates here are ISO calendar days, "2026-11-03", read as UTC so no clock can shift them. */
export const DAY_MS = 86_400_000;

const dayNumber = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / DAY_MS;

export const daysBetween = (fromIso: string, toIso: string) => Math.round(dayNumber(toIso) - dayNumber(fromIso));

export const addDays = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

/** Days so far in that day's Monday-to-Sunday week: 1 on a Monday, 7 on a Sunday. */
export const dayOfWeek = (iso: string) => ((new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;

export const mondayOf = (iso: string) => addDays(iso, 1 - dayOfWeek(iso));

const formats = new Map<string, Intl.DateTimeFormat>();

/** The IANA name for a time zone, as the runtime spells it, or null when it doesn't know it. */
export function canonicalZone(timeZone: string): string | null {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

/**
 * The calendar date somewhere, so someone's week ends at their own midnight. No zone, or one the
 * runtime doesn't know, means UTC. Zones come in canonical, so this cache holds at most one per real zone.
 */
export function dateIn(timeZone: string | null | undefined, at: Date = new Date()): string {
  if (!timeZone) return at.toISOString().slice(0, 10);
  try {
    let format = formats.get(timeZone);
    if (!format) {
      format = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
      formats.set(timeZone, format);
    }
    const part = (type: string) => format.formatToParts(at).find((item) => item.type === type)?.value;
    return `${part('year')}-${part('month')}-${part('day')}`;
  } catch {
    return at.toISOString().slice(0, 10);
  }
}
