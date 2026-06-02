import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const isLocalhost = Platform.OS === 'web' &&
  typeof window !== 'undefined' &&
  window.location.hostname === 'localhost';

const PUSH_ENDPOINT = isLocalhost
  ? 'http://localhost:3001'
  : '';

export async function requestPushPermission() {
  if (Platform.OS !== 'web' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { granted: false, error: 'Push not supported on this platform' };
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return { granted: false, error: 'User denied permission' };
    }

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY),
    });

    // Save subscription to server
    const userId = await AsyncStorage.getItem('userId');
    if (!userId) return { granted: false, error: 'No userId' };

    await fetch(`${PUSH_ENDPOINT}/save-subscription`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, subscription: subscription.toJSON() }),
    });

    await AsyncStorage.setItem('pushSubscribed', 'true');
    return { granted: true };
  } catch (err) {
    console.error('Push registration failed:', err);
    return { granted: false, error: err.message };
  }
}

export async function isPushSubscribed() {
  if (Platform.OS !== 'web') return false;
  const subscribed = await AsyncStorage.getItem('pushSubscribed');
  return subscribed === 'true';
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');
  const rawData = window.atob(base64);
  return new Uint8Array([...rawData].map((char) => char.charCodeAt(0)));
}

export async function sendTestPush() {
  if (Platform.OS !== 'web') return;
  try {
    const userId = await AsyncStorage.getItem('userId');
    if (!userId) return;
    await fetch(`${PUSH_ENDPOINT}/send-push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        title: 'IBS Tracker',
        body: 'Test notification',
      }),
    });
  } catch (err) {
    console.error('Send test push failed:', err);
  }
}
