import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { registerPush, unregisterPush } from './api';

// Show a banner + list entry even when the app is in the foreground.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

let lastToken: string | null = null;

/**
 * Ask permission, fetch an Expo push token, and register it with the server.
 * Guarded end-to-end: on a simulator, in Expo Go on iOS (no remote push since
 * SDK 53), without an EAS projectId, or offline, it simply no-ops — push stays
 * off and nothing breaks. Real delivery needs an EAS dev build + Apple APNs key.
 */
export async function registerForPush(): Promise<void> {
  try {
    if (!Device.isDevice) return;
    const existing = await Notifications.getPermissionsAsync();
    let granted = existing.granted;
    if (!granted) granted = (await Notifications.requestPermissionsAsync()).granted;
    if (!granted) return;
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ?? (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId;
    const tok = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    if (tok?.data) {
      lastToken = tok.data;
      await registerPush(tok.data);
    }
  } catch {
    /* Expo Go iOS / no EAS project / offline — push just stays off. */
  }
}

/** Remove this device's token server-side (call on sign-out). */
export async function unregisterForPush(): Promise<void> {
  try {
    if (lastToken) await unregisterPush(lastToken);
  } catch {
    /* ignore */
  }
  lastToken = null;
}
