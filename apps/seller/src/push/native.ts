// The expo-notifications side of push (0.3.0, decision #70): how notifications show while
// the app is open, the Android "orders" channel, the permission and the Expo push token.
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { colors } from '@/theme';
import type { PushDevice } from './session';

// While the app is open, still show the banner and play the sound.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function ensureChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('orders', {
    name: 'Orders',
    importance: Notifications.AndroidImportance.HIGH,
    // Android keeps a channel's settings once created: phones that have it keep the old colour.
    lightColor: colors.primary,
  });
}

export const nativePushDevice: PushDevice = {
  async permission() {
    const { status } = await Notifications.getPermissionsAsync();
    return status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined';
  },
  async request() {
    // Android 13+ shows the prompt only once a channel exists.
    await ensureChannel();
    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  },
  async token() {
    try {
      await ensureChannel();
      const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
      const { data } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : {});
      return data || null;
    } catch {
      // No Play services, no network, or Firebase not configured in this build.
      return null;
    }
  },
};
