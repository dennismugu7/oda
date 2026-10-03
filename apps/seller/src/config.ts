// Build-time config (Expo inlines EXPO_PUBLIC_* values). Never a secret here.
// Redmi over wireless debugging: http://localhost:3000 with `adb reverse tcp:3000 tcp:3000`.
// Emulator: http://10.0.2.2:3000. Staging APK: https://oda-eta.vercel.app.

export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000').replace(
  /\/+$/,
  '',
);
export const SHOP_BASE_URL = (process.env.EXPO_PUBLIC_SHOP_BASE_URL ?? API_URL).replace(/\/+$/, '');

/** Shown in development builds so it's always clear which server the app talks to. */
export function apiLabel(url: string = API_URL): string {
  try {
    const { host } = new URL(url);
    return host.startsWith('localhost') || host.startsWith('10.0.2.2') ? `local · ${host}` : host;
  } catch {
    return url;
  }
}
