// Sentry privacy scrubbing for the web and the app (M10 CP4, decisions #45, #81 b). Both set
// sendDefaultPii: false and pass every event and breadcrumb through these functions before
// anything leaves the device or server. They work on plain objects (no Sentry types), so the
// same code and the same tests cover both SDKs.
//
// Removed or masked: email addresses, phone numbers, M-Pesa codes, order tokens and order
// links (/o/…), reset / delete tokens (#token=…), Authorization / Cookie / Set-Cookie headers,
// request bodies and query strings, user objects, and any field whose name says it is secret
// or personal (password, token, code, phone, email, name, address, message, …).

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// Kenyan numbers in any written form, and any other run of 9+ digits with separators.
const PHONE = /(?:\+?254|\b0)[\s.-]?[17]\d{2}[\s.-]?\d{3}[\s.-]?\d{3}\b|\+?\d(?:[\s.-]?\d){8,}/g;
// M-Pesa transaction codes: 10 capitals and digits, starting with a letter, at least 2 digits.
const MPESA = /\b(?=[A-Z0-9]{10}\b)(?=(?:[A-Z]*\d){2})[A-Z][A-Z0-9]{9}\b/g;
const ORDER_LINK = /\/o\/[A-Za-z0-9_-]{6,}/g;
const FRAGMENT_TOKEN = /#token=[^\s"'&]+/g;
// Long opaque strings: session tokens, push tokens, keys, hashes (UUIDs stay readable).
const OPAQUE = /\b(?![0-9a-f]{8}-[0-9a-f]{4}-)[A-Za-z0-9_-]{24,}\b/g;
const EXPO_TOKEN = /ExponentPushToken\[[^\]]+\]/g;
// A database error's message lists the query's values ("params: Wanjiku,0712…,Rhapta Rd") and
// Postgres repeats row values in its detail ("Key (email)=(…)"): names and addresses that no
// pattern above would catch. Both go entirely.
const QUERY_PARAMS = /\bparams:[^\n]*/gi;
const KEY_DETAIL = /(\([^()]*\))=\([^()]*\)/g;

const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
// Ids are set aside while masking (their digits would look like phone numbers), as private-use
// characters that no pattern above matches.
const ID_SLOT = /\uE000(\d+)\uE001/g;

/** Masks personal data and secrets inside a free-text string (ids stay readable). */
export function scrubString(text: string): string {
  const ids: string[] = [];
  const masked = text
    .replace(QUERY_PARAMS, 'params: [removed]')
    .replace(KEY_DETAIL, '$1=[removed]')
    .replace(UUID, (id) => `\uE000${ids.push(id) - 1}\uE001`)
    .replace(FRAGMENT_TOKEN, '#token=[token]')
    .replace(ORDER_LINK, '/o/[token]')
    .replace(EXPO_TOKEN, '[push-token]')
    .replace(EMAIL, '[email]')
    .replace(MPESA, '[mpesa-code]')
    .replace(PHONE, '[phone]')
    .replace(OPAQUE, '[token]');
  return masked.replace(ID_SLOT, (_, i: string) => ids[Number(i)]!);
}

/** Keys whose values are dropped wherever they appear (compared case-insensitively). */
const SENSITIVE_KEY =
  /pass(word)?|secret|token|auth|cookie|session|code|otp|phone|email|e-mail|name|address|message|body|data|query|mpesa|whatsapp|ip_address|ip$|^vars$/i;
/** Keys that look sensitive but are Sentry's own structure and safe to keep. */
const KEEP_KEYS = new Set([
  'event_id',
  'type',
  'value',
  'module',
  'filename',
  'function',
  'abs_path',
  'lineno',
  'colno',
  'in_app',
  'platform',
  'level',
  'logger',
  'release',
  'environment',
  'dist',
  'timestamp',
  'category',
  'mechanism',
  'handled',
  'status_code',
  'method',
  'url',
  'frames',
  'stacktrace',
  'values',
  'exception',
  'breadcrumbs',
  'contexts',
  'tags',
  'extra',
  'request',
  'headers',
  'sdk',
  'transaction',
  'span_id',
  'trace_id',
  'op',
  'description',
]);

const MAX_DEPTH = 8;

function scrubValue(value: unknown, depth: number): unknown {
  if (typeof value === 'string') return scrubString(value);
  if (value === null || typeof value !== 'object') return value;
  if (depth > MAX_DEPTH) return '[depth]';
  if (Array.isArray(value)) return value.map((v) => scrubValue(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (!KEEP_KEYS.has(key) && SENSITIVE_KEY.test(key)) {
      out[key] = '[removed]';
      continue;
    }
    out[key] = scrubValue(v, depth + 1);
  }
  return out;
}

type Loose = Record<string, unknown>;

function scrubRequest(request: unknown): Loose | undefined {
  if (!request || typeof request !== 'object') return undefined;
  const r = request as Loose;
  const headers: Loose = {};
  for (const [k, v] of Object.entries((r.headers as Loose | undefined) ?? {})) {
    if (
      /^(authorization|cookie|set-cookie|x-forwarded-for|x-real-ip|x-vercel-forwarded-for|expo-origin)$/i.test(
        k,
      )
    )
      continue;
    headers[k] = typeof v === 'string' ? scrubString(v) : v;
  }
  const url =
    typeof r.url === 'string' ? scrubString(r.url.split('?')[0]!.split('#')[0]!) : undefined;
  // No body (data), cookies, query string or environment.
  return { ...(url ? { url } : {}), ...(r.method ? { method: r.method } : {}), headers };
}

/**
 * Sentry `beforeSend` for errors (and `beforeSendTransaction`): returns a copy with personal
 * data and secrets removed. Never throws: on any surprise it drops the event (returns null)
 * rather than risk sending it unscrubbed.
 */
export function scrubEvent<T>(event: T): T | null {
  try {
    const e = scrubValue(event, 0) as Loose;
    const original = event as Loose;
    delete e.user;
    delete e.server_name;
    // The SDK's own name, version and integrations: no personal data, and Sentry needs them.
    if (original.sdk) e.sdk = original.sdk;
    if (original.request) e.request = scrubRequest(original.request);
    if (Array.isArray(original.breadcrumbs)) {
      e.breadcrumbs = original.breadcrumbs.map((b) => scrubBreadcrumb(b)).filter(Boolean);
    }
    return e as T;
  } catch {
    return null;
  }
}

/** Sentry `beforeBreadcrumb`: navigation and fetch URLs lose tokens and query strings. */
export function scrubBreadcrumb<T>(breadcrumb: T): T | null {
  try {
    const b = scrubValue(breadcrumb, 0) as Loose;
    const data = (breadcrumb as Loose).data as Loose | undefined;
    if (data && typeof data === 'object') {
      const keep: Loose = {};
      for (const key of ['url', 'from', 'to', 'method', 'status_code']) {
        const v = data[key];
        if (typeof v === 'string') keep[key] = scrubString(v.split('?')[0]!.split('#')[0]!);
        else if (typeof v === 'number') keep[key] = v;
      }
      b.data = keep;
    }
    return b as T;
  } catch {
    return null;
  }
}
