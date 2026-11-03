/** Dates here are ISO calendar days, "2026-11-03", read as UTC so no clock can shift them. */
export const DAY_MS = 86_400_000;

const dayNumber = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / DAY_MS;

export const daysBetween = (fromIso: string, toIso: string) => Math.round(dayNumber(toIso) - dayNumber(fromIso));

export const addDays = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

/** Days so far in that day's Monday-to-Sunday week: 1 on a Monday, 7 on a Sunday. */
export const dayOfWeek = (iso: string) => ((new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;

export const mondayOf = (iso: string) => addDays(iso, 1 - dayOfWeek(iso));
