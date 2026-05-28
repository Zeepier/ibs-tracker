import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function requestPermissions() {
  if (Platform.OS === 'web') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

// Schedule all active reminders from scratch
export async function rescheduleAll(reminders) {
  if (Platform.OS === 'web') return;
  await Notifications.cancelAllScheduledNotificationsAsync();
  for (const r of reminders) {
    if (!r.enabled) continue;
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'IBS Tracker',
        body: r.type === 'symptom'
          ? "Don't forget to log your symptoms today!"
          : "Time to log what you ate!",
      },
      trigger: { hour: r.hour, minute: r.minute, repeats: true },
    });
  }
}

const STORAGE_KEY = 'reminders';

const DEFAULTS = [
  { id: 'symptom', type: 'symptom', label: 'Symptom check', hour: 20, minute: 0, enabled: false },
];

export async function loadReminders() {
  const stored = await AsyncStorage.getItem(STORAGE_KEY);
  return stored ? JSON.parse(stored) : DEFAULTS;
}

export async function saveReminders(reminders) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(reminders));
  await rescheduleAll(reminders);
}

// ── Web Push (PWA) ────────────────────────────────────────────────────────────
// VAPID public key (public — safe to hardcode)
const VAPID_PUBLIC_KEY = process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY
  || 'BFeB_hIuZzAHO9H9UFASl5rWZMTLN4gAXp0sFmri2C2vAlHPST1ene9EKxiya6QBj33VomKctujNMa6bM1HL-jc';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

export async function subscribeWebPush(reminders) {
  if (Platform.OS !== 'web') return { error: 'not web' };
  if (typeof window === 'undefined') return { error: 'no window' };
  if (!('serviceWorker' in navigator)) return { error: 'no serviceWorker' };
  if (!('PushManager' in window)) return { error: 'no PushManager' };
  if (!VAPID_PUBLIC_KEY) return { error: 'no VAPID key in bundle' };

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return { error: `permission: ${permission}` };

    const registration = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((_, reject) => setTimeout(() => reject(new Error('SW ready timeout after 10s')), 10000)),
    ]);

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });

    const proxyUrl = window.location.hostname === 'localhost'
      ? 'http://localhost:3001/save-subscription'
      : '/.netlify/functions/save-subscription';

    const res = await fetch(proxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscription,
        reminders,
        timezoneOffset: new Date().getTimezoneOffset(),
      }),
    });

    if (!res.ok) return { error: `save-subscription HTTP ${res.status}` };
    return { ok: true };
  } catch (err) {
    console.warn('Web push subscription failed:', err);
    return { error: err.message };
  }
}
