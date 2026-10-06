// Order times for the seller app, in Nairobi time (spec §3). Kenya is UTC+3 all year (no
// daylight saving), so this is plain arithmetic: it doesn't depend on the phone's time zone
// or on Intl time-zone support in the app's JS engine.

const OFFSET_MS = 3 * 60 * 60 * 1000;
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The Nairobi wall clock as a UTC date (read it with getUTC*). */
function wall(at: Date): Date {
  return new Date(at.getTime() + OFFSET_MS);
}

function dayNumber(at: Date): number {
  return Math.floor(wall(at).getTime() / 86_400_000);
}

/** "10:48" (24-hour, as in design 17-orders). */
export function clock24(at: Date): string {
  const w = wall(at);
  return `${String(w.getUTCHours()).padStart(2, '0')}:${String(w.getUTCMinutes()).padStart(2, '0')}`;
}

/** "Wed 30 Sep". */
export function shortDate(at: Date): string {
  const w = wall(at);
  return `${DAYS[w.getUTCDay()]} ${w.getUTCDate()} ${MONTHS[w.getUTCMonth()]}`;
}

/** List rows: "Just now", "12 min ago", "10:48" (today), "Yesterday", "Wed 30 Sep". */
export function listTime(at: Date, now: Date = new Date()): string {
  const minutes = Math.floor((now.getTime() - at.getTime()) / 60_000);
  if (minutes < 1 && minutes > -2) return 'Just now';
  if (minutes >= 1 && minutes < 60) return `${minutes} min ago`;
  const days = dayNumber(now) - dayNumber(at);
  if (days === 0) return clock24(at);
  if (days === 1) return 'Yesterday';
  return shortDate(at);
}

/** The order header: "Today, 10:31", "Yesterday, 18:02", "Wed 30 Sep, 09:15". */
export function headerTime(at: Date, now: Date = new Date()): string {
  const days = dayNumber(now) - dayNumber(at);
  const day = days === 0 ? 'Today' : days === 1 ? 'Yesterday' : shortDate(at);
  return `${day}, ${clock24(at)}`;
}

/** Review cards (20b-reviews): "Today", "Yesterday", "3 days ago" (up to 6), then "Wed 30 Sep". */
export function daysAgo(at: Date, now: Date = new Date()): string {
  const days = dayNumber(now) - dayNumber(at);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return shortDate(at);
}
