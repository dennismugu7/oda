// Order times for buyers, always in Nairobi time (spec §3): "10:42am" today, "Wed 30 Sep"
// on other days, and "Saturday, 3 Oct · 2:05pm" for the delivered card (05c).

const TZ = 'Africa/Nairobi';

function parts(at: Date, options: Intl.DateTimeFormatOptions) {
  return Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: TZ, ...options })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
}

export function clockTime(at: Date): string {
  const p = parts(at, { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${p.hour}:${p.minute}${(p.dayPeriod ?? '').toLowerCase().replace(/\s|\./g, '')}`;
}

const day = (at: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TZ, dateStyle: 'short' }).format(at);

/** "10:42am" on the same Nairobi day as `now`, otherwise "Wed 30 Sep". */
export function orderTime(at: Date, now: Date = new Date()): string {
  if (day(at) === day(now)) return clockTime(at);
  const p = parts(at, { weekday: 'short', day: 'numeric', month: 'short' });
  return `${p.weekday} ${p.day} ${p.month}`;
}

/** "Saturday, 3 Oct · 2:05pm". */
export function orderDayTime(at: Date): string {
  const p = parts(at, { weekday: 'long', day: 'numeric', month: 'short' });
  return `${p.weekday}, ${p.day} ${p.month} · ${clockTime(at)}`;
}
