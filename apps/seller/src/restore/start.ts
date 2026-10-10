// Where a signed-in seller lands on a cold start (decision #100): the screen they were on when
// Android closed oda, if that was under an hour ago, with its tab underneath; else Home. A
// notification tap that started the app wins (the tabs open its order: src/push/usePush.ts).
import * as Notifications from 'expo-notifications';
import { restoreStore } from './native';
import { restorePlan, type TabRoot } from './route';

export async function landing(): Promise<{ tab: TabRoot; screen: string | null }> {
  try {
    const memory = await restoreStore.loadRoute();
    // Used once: a later start without leaving the app again opens Home.
    await restoreStore.deleteRoute();
    if (Notifications.getLastNotificationResponse()) return { tab: '/home', screen: null };
    return restorePlan(memory);
  } catch {
    return { tab: '/home', screen: null };
  }
}
