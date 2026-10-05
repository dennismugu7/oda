import 'server-only';
import type { z } from 'zod';

// HTTP errors thrown by the authorization layer, repositories and transitionOrder().
// Route handlers turn them into JSON with toResponse(); messages are shown to users as is.

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code: string,
    readonly fields?: Record<string, string>,
    /** Seconds until the action can be tried again (rate limits, cooldowns). */
    readonly retryAfter?: number,
    /** Extra data the client needs to recover (e.g. the current prices after a change). */
    readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class UnauthorizedError extends HttpError {
  constructor(message = 'Please sign in again.') {
    super(401, message, 'unauthorized');
  }
}

export class ForbiddenError extends HttpError {
  constructor(message = "You can't do that.") {
    super(403, message, 'forbidden');
  }
}

/** Also used for other shops' rows and admin routes, so they look exactly like missing ones. */
export class NotFoundError extends HttpError {
  constructor(message = "We couldn't find that.") {
    super(404, message, 'not_found');
  }
}

export class ConflictError extends HttpError {
  constructor(message = 'This changed. Refresh and try again.', code = 'conflict') {
    super(409, message, code);
  }
}

/** 409: the buyer's total is out of date; `details` carries the current lines and totals. */
export class PriceChangedError extends HttpError {
  constructor(details: unknown) {
    super(
      409,
      'Some prices changed since you added them. Check the new total before you order.',
      'price_changed',
      undefined,
      undefined,
      details,
    );
  }
}

/** 403: a write from another website (no or a foreign Origin). */
export class CrossSiteError extends HttpError {
  constructor() {
    super(
      403,
      'This request came from another website. Open the shop and try again.',
      'cross_site',
    );
  }
}

export class TooManyRequestsError extends HttpError {
  constructor(message = 'Too many tries. Try again in a few minutes.', retryAfter?: number) {
    super(429, message, 'rate_limited', undefined, retryAfter);
  }
}

export class ValidationError extends HttpError {
  constructor(message: string, fields?: Record<string, string>, code = 'invalid') {
    super(422, message, code, fields);
  }
}

/** Parses a request body against a write whitelist; 422 with per-field messages otherwise. */
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) {
    if (issue.code === 'unrecognized_keys') {
      for (const key of issue.keys) fields[key] ??= "This field can't be changed.";
    } else {
      fields[issue.path.join('.') || '_'] ??= issue.message;
    }
  }
  const first = result.error.issues[0];
  const message =
    first?.code === 'unrecognized_keys' ? "Some of these fields can't be changed." : first?.message;
  throw new ValidationError(message ?? 'Check the highlighted fields.', fields);
}

interface PgError {
  code?: string;
  constraint?: string;
  hint?: string;
  message?: string;
}

/** Friendly messages for the constraints and guards a seller can run into. */
const CONSTRAINT_MESSAGES: Record<string, [status: 409 | 422, message: string]> = {
  shops_slug_unique: [409, 'That link is taken. Try another one.'],
  shops_owner_id_unique: [409, 'You already have a shop.'],
  shops_payment_option: [
    422,
    'Keep at least one way for buyers to pay: before delivery or on delivery.',
  ],
  payment_accounts_one_active: [409, 'Only one M-Pesa account can be active.'],
  payment_accounts_paybill_ref: [422, 'Check the Paybill account number.'],
  products_compare_at_price: [422, 'The was-price must be higher than the price.'],
  shops_free_delivery_threshold: [422, 'Free delivery amount must be more than 0.'],
};

/**
 * Maps a Postgres error (drizzle wraps it in `cause`) to an HttpError, or returns null when
 * it isn't one a user can fix. Callers rethrow null cases unchanged.
 */
export function fromDatabaseError(error: unknown): HttpError | null {
  const pg = findPgError(error);
  if (!pg) return null;
  if (pg.hint === 'oda_slug_in_history') {
    return new ConflictError('That link is taken. Try another one.', 'slug_taken');
  }
  const known = pg.constraint ? CONSTRAINT_MESSAGES[pg.constraint] : undefined;
  if (known) {
    const [status, message] = known;
    return status === 409 ? new ConflictError(message) : new ValidationError(message);
  }
  return null;
}

function findPgError(error: unknown): PgError | null {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current && typeof current === 'object'; depth++) {
    const candidate = current as PgError & { cause?: unknown };
    if (typeof candidate.code === 'string' && /^[0-9A-Z]{5}$/.test(candidate.code)) {
      return candidate;
    }
    current = candidate.cause;
  }
  return null;
}

/** Runs a write and turns known database errors into friendly HttpErrors. */
export async function withDbErrors<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (error) {
    throw fromDatabaseError(error) ?? error;
  }
}

/** JSON response for route handlers. Unknown errors become a generic 500 (logged). */
export function toResponse(error: unknown): Response {
  const http = error instanceof HttpError ? error : fromDatabaseError(error);
  if (http) {
    return Response.json(
      {
        error: {
          code: http.code,
          message: http.message,
          fields: http.fields,
          retryAfter: http.retryAfter,
          details: http.details,
        },
      },
      { status: http.status },
    );
  }
  console.error('[api] unexpected error', error);
  return Response.json(
    { error: { code: 'server_error', message: 'Something went wrong. Please try again.' } },
    { status: 500 },
  );
}
