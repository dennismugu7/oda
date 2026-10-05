import 'server-only';
import { toResponse } from './errors';

// The shape shared by the seller API's route handlers (M6 onwards): run, answer JSON with
// no-store, 204 for undefined, and turn errors into toResponse() JSON.

type Params = { params: Promise<{ id: string }> };
export type Handler = (request: Request, context: Params) => Promise<Response>;

export function handle(
  run: (request: Request, id: string | null) => Promise<unknown>,
  status = 200,
): Handler {
  return async (request, context) => {
    try {
      const id = context?.params ? (await context.params).id : null;
      const result = await run(request, id);
      if (result === undefined) return new Response(null, { status: 204 });
      return Response.json(result, { status, headers: { 'cache-control': 'no-store' } });
    } catch (error) {
      return toResponse(error);
    }
  };
}

/** The request's JSON body, or null when it isn't JSON. */
export const body = (request: Request) => request.json().catch(() => null);
