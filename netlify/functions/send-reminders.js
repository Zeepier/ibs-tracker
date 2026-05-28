const webpush = require('web-push');

// Uses Upstash Redis REST API — no SDK needed, just fetch.
// Required env vars: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN

async function redis(method, ...args) {
  const url = `${process.env.UPSTASH_REDIS_REST_URL}/${[method, ...args].map(encodeURIComponent).join('/')}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` },
  });
  if (!res.ok) throw new Error(`Upstash ${method} failed: ${res.status}`);
  const json = await res.json();
  return json.result;
}

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT || 'mailto:ibs@tracker.app',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY,
);

// Runs every 15 minutes via netlify.toml schedule.
// Also callable manually: GET /.netlify/functions/send-reminders?force=1
exports.handler = async (event) => {
  const force = event?.queryStringParameters?.force === '1';

  try {
    // Get all subscription keys
    const keys = await redis('KEYS', 'sub:*');

    if (!keys || !keys.length) return { statusCode: 200, body: 'No subscriptions found' };

    const nowUtc = new Date();
    let sent = 0;

    for (const key of keys) {
      try {
        const raw = await redis('GET', key);
        if (!raw) continue;

        const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
        const { subscription, reminders, timezoneOffset = 0 } = data;

        // Convert UTC time to device's local time
        const localMs = nowUtc.getTime() - (timezoneOffset * 60 * 1000);
        const localNow = new Date(localMs);
        const h = localNow.getUTCHours();
        const m = localNow.getUTCMinutes();

        for (const reminder of reminders) {
          if (!reminder.enabled) continue;

          // force=1 bypasses time check (for testing)
          if (!force) {
            const scheduledMinutes = reminder.hour * 60 + reminder.minute;
            const currentMinutes = h * 60 + m;
            if (Math.abs(scheduledMinutes - currentMinutes) > 8) continue;
          }

          const body = reminder.type === 'symptom'
            ? "Time to log your symptoms 📊"
            : `${reminder.label} — time to log your meal 🍽️`;

          await webpush.sendNotification(
            subscription,
            JSON.stringify({ title: 'IBS Tracker', body }),
          );
          sent++;
        }
      } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          await redis('DEL', key);
        }
      }
    }

    return { statusCode: 200, body: `Sent ${sent} notification(s)` };
  } catch (err) {
    console.error('send-reminders error:', err);
    return { statusCode: 500, body: err.message };
  }
};
