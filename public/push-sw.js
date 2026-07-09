// Service worker for Web Push notifications
self.addEventListener('push', event => {
  let title = 'IBS Tracker';
  let body = 'Time to log your symptoms!';
  // Use payload if present, otherwise fall back to the default reminder text
  if (event.data) {
    try {
      const data = event.data.json();
      if (data.title) title = data.title;
      if (data.body) body = data.body;
    } catch (e) {
      // non-JSON or empty payload — keep defaults
    }
  }
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      vibrate: [200, 100, 200],
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(clients.openWindow('/'));
});
