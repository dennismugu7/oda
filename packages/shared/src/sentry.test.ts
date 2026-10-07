import { describe, expect, it } from 'vitest';
import { scrubBreadcrumb, scrubEvent, scrubString } from './sentry';

// Decision #81 b: nothing personal or secret reaches Sentry from the web or the app.

const SECRETS = {
  email: 'wanjiku.mwangi@example.test',
  phone07: '0712 345 678',
  phone254: '+254712345678',
  phoneDots: '0712.345.678',
  mpesa: 'SJK4X7PQ2M',
  orderToken: 'aB3dE5fG7hJ9',
  resetToken: 'Zx9_long-reset-token-value-1234567890',
  session: 'oda.session_token=abcdefghijklmnopqrstuvwxyz0123456789',
  bearer: 'Bearer abcdefghijklmnopqrstuvwxyz0123456789ABCD',
  push: 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]',
  password: 'hunter2-Kenya!',
  address: 'Argwings Kodhek Rd, Hurlingham',
  buyerName: 'Wanjiku Mwangi',
};

function event() {
  return {
    event_id: 'e1',
    level: 'error',
    release: 'oda-seller@0.3.0+ec8679c3',
    message: `Order for ${SECRETS.buyerName} ${SECRETS.phone07}`,
    user: { id: 'u1', email: SECRETS.email, ip_address: '197.232.1.1' },
    server_name: 'vercel-fra1-abc',
    exception: {
      values: [
        {
          type: 'Error',
          value: `Payment ${SECRETS.mpesa} from ${SECRETS.phone254} for /o/${SECRETS.orderToken} (${SECRETS.email})`,
          stacktrace: {
            frames: [
              {
                filename: 'app:///orders/[id].tsx',
                function: 'confirm',
                lineno: 12,
                vars: { phone: SECRETS.phone07, note: 'x' },
              },
            ],
          },
          mechanism: { type: 'onerror', handled: false },
        },
      ],
    },
    request: {
      url: `https://oda-eta.vercel.app/o/${SECRETS.orderToken}?s=wa#token=${SECRETS.resetToken}`,
      method: 'POST',
      headers: {
        Authorization: SECRETS.bearer,
        Cookie: SECRETS.session,
        'User-Agent': 'Mozilla/5.0',
        'x-forwarded-for': '197.232.1.1',
      },
      data: {
        buyer: { name: SECRETS.buyerName, phone: SECRETS.phone07 },
        password: SECRETS.password,
      },
      query_string: `phone=${SECRETS.phone07}`,
      cookies: { session: SECRETS.session },
    },
    extra: {
      buyerPhone: SECRETS.phoneDots,
      addressText: SECRETS.address,
      note: `push ${SECRETS.push}`,
      orderId: '3f2b1c4d-1111-4a2b-9c3d-123456789abc',
    },
    breadcrumbs: [
      {
        category: 'fetch',
        data: {
          url: `/api/o/${SECRETS.orderToken}/code?x=${SECRETS.phone07}`,
          method: 'POST',
          status_code: 409,
          body: SECRETS.mpesa,
        },
      },
      {
        category: 'navigation',
        data: { from: '/reset-password#token=abc', to: `/o/${SECRETS.orderToken}` },
      },
      { category: 'console', message: `signed in as ${SECRETS.email}` },
    ],
    sdk: { name: 'sentry.javascript.react-native', version: '7.11.0' },
  };
}

describe('scrubEvent', () => {
  it('leaves no email, phone, M-Pesa code, token, password, name or address anywhere', () => {
    const json = JSON.stringify(scrubEvent(event()));
    for (const [what, secret] of Object.entries(SECRETS)) {
      expect(json, what).not.toContain(secret);
    }
    expect(json).not.toContain('197.232.1.1');
    expect(json).not.toContain('Hurlingham');
  });

  it('drops the user, the body, cookies, the query and auth headers; keeps what helps debugging', () => {
    const e = scrubEvent(event())!;
    expect(e.user).toBeUndefined();
    expect(e.server_name).toBeUndefined();
    expect(e.request).toEqual({
      url: 'https://oda-eta.vercel.app/o/[token]',
      method: 'POST',
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    const ex = e.exception.values[0]!;
    expect(ex.type).toBe('Error');
    expect(ex.value).toBe('Payment [mpesa-code] from [phone] for /o/[token] ([email])');
    expect(ex.stacktrace.frames[0]).toMatchObject({
      filename: 'app:///orders/[id].tsx',
      lineno: 12,
    });
    expect(ex.stacktrace.frames[0]!.vars).toBe('[removed]');
    expect(e.extra.orderId).toBe('3f2b1c4d-1111-4a2b-9c3d-123456789abc');
    expect(e.sdk).toEqual({ name: 'sentry.javascript.react-native', version: '7.11.0' });
    expect(e.release).toBe('oda-seller@0.3.0+ec8679c3');
  });

  it('breadcrumbs keep the path, method and status only', () => {
    const [fetchCrumb, nav] = scrubEvent(event())!.breadcrumbs;
    expect(fetchCrumb!.data).toEqual({
      url: '/api/o/[token]/code',
      method: 'POST',
      status_code: 409,
    });
    expect(nav!.data).toEqual({ from: '/reset-password', to: '/o/[token]' });
  });

  it('drops an event it can’t read rather than send it', () => {
    const cyclic: Record<string, unknown> = { request: {} };
    Object.defineProperty(cyclic, 'boom', {
      enumerable: true,
      get() {
        throw new Error('no');
      },
    });
    expect(scrubEvent(cyclic)).toBeNull();
  });
});

describe('scrubBreadcrumb and scrubString', () => {
  it('a console breadcrumb loses its message', () => {
    expect(scrubBreadcrumb({ category: 'console', message: `call ${SECRETS.phone254}` })).toEqual({
      category: 'console',
      message: '[removed]',
    });
  });

  it('masks each kind', () => {
    expect(scrubString(`${SECRETS.email} ${SECRETS.phone07} ${SECRETS.mpesa}`)).toBe(
      '[email] [phone] [mpesa-code]',
    );
    expect(scrubString('KES 2,500 for 3 items')).toBe('KES 2,500 for 3 items');
    expect(scrubString('Order #1042')).toBe('Order #1042');
  });
});
