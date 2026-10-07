// What an unexpected error may put in the logs (decision #45, M10 CP1). Logging the error
// object itself is not safe: a Drizzle query error's message carries the query's parameters
// (buyer phones, emails, token hashes) and a Postgres error's `detail` repeats row values
// ("Key (email)=(…) already exists"). This keeps the name, Postgres' code, table, column and
// constraint, the SQL text without its parameters, a scrubbed message and the stack frames.

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// Kenyan and other phone numbers: 9 or more digits, with spaces, dots or dashes between.
const PHONE = /\+?\d(?:[\s.-]?\d){8,}/g;
// Tokens, hashes, keys: long runs of letters, digits, _ and - (UUIDs stay: they're not secret).
const TOKEN = /\b(?![0-9a-f]{8}-[0-9a-f]{4}-)[A-Za-z0-9_-]{24,}\b/g;

/** Removes emails, phone numbers and token-like strings from a message. */
export function scrubText(text: string): string {
  return text.replace(EMAIL, '[email]').replace(PHONE, '[phone]').replace(TOKEN, '[token]');
}

interface PgLike {
  code?: string;
  table?: string;
  column?: string;
  constraint?: string;
  routine?: string;
}

function pgFields(value: unknown): PgLike | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as PgLike & { severity?: unknown };
  // node-postgres DatabaseError: a SQLSTATE code plus severity.
  return typeof v.code === 'string' && /^[0-9A-Z]{5}$/.test(v.code) && v.severity ? v : null;
}

/** A one-line, log-safe description of any thrown value, with its stack frames. */
export function describeError(error: unknown): string {
  if (!(error instanceof Error)) return `non-error thrown (${typeof error})`;
  const parts: string[] = [error.name];
  const pg = pgFields(error) ?? pgFields(error.cause);
  if (pg) {
    for (const key of ['code', 'table', 'column', 'constraint', 'routine'] as const) {
      if (pg[key]) parts.push(`${key}=${pg[key]}`);
    }
  }
  const query = (error as { query?: unknown }).query;
  if (typeof query === 'string') {
    parts.push(`query: ${query.slice(0, 300)}`); // the SQL text only, never `params`
  } else if (!pgFields(error)) {
    parts.push(`message: ${scrubText(error.message.split('\n')[0] ?? '').slice(0, 300)}`);
  }
  const cause = error.cause;
  if (cause instanceof Error && !pg && typeof query !== 'string') {
    parts.push(`cause: ${cause.name}`);
  }
  const frames = (error.stack ?? '')
    .split('\n')
    .filter((line) => line.trimStart().startsWith('at '))
    .slice(0, 8)
    .map((line) => line.trim());
  return [parts.join(' · '), ...frames].join('\n  ');
}
