export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 200, headers: corsHeaders() });
    }

    // Scheduled reminders trigger (cron)
    if (request.method === 'POST' && url.pathname === '/scheduled') {
      return handleScheduledReminders(env);
    }

    // Claude API proxy
    if (url.pathname === '/claude' && request.method === 'POST') {
      return handleClaude(request, env);
    }

    // Recipe URL fetcher
    if (url.pathname === '/fetch' && request.method === 'GET') {
      return handleFetch(request);
    }

    // Backup endpoints
    if (url.pathname === '/backup' && request.method === 'POST') {
      return handleBackupSave(request, env);
    }
    if (url.pathname.startsWith('/backup/') && request.method === 'GET') {
      return handleBackupLoad(request, env);
    }

    // Push notification endpoints
    if (url.pathname === '/save-subscription' && request.method === 'POST') {
      return handleSaveSubscription(request, env);
    }
    if (url.pathname === '/send-push' && request.method === 'POST') {
      return handleSendPush(request, env);
    }
    if (url.pathname === '/save-reminders' && request.method === 'POST') {
      return handleSaveReminders(request, env);
    }

    // Serve static assets with SPA fallback (for React Navigation routes)
    const assetResponse = await env.ASSETS.fetch(request);
    if (assetResponse.status === 404) {
      return env.ASSETS.fetch(new Request(new URL('/', request.url), request));
    }
    return assetResponse;
  },
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };
}

async function handleClaude(request, env) {
  try {
    const body = await request.text();
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body,
    });
    const text = await response.text();
    return new Response(text, {
      status: response.status,
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
    });
  }
}

async function handleBackupSave(request, env) {
  try {
    const { userId, data } = await request.json();
    if (!userId || !data) return new Response('Missing userId or data', { status: 400 });
    await env.IBS_BACKUP.put(`backup:${userId}`, JSON.stringify(data));
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders() });
  }
}

async function handleBackupLoad(request, env) {
  try {
    const userId = request.url.split('/backup/')[1];
    if (!userId) return new Response('Missing userId', { status: 400 });
    const raw = await env.IBS_BACKUP.get(`backup:${userId}`);
    if (!raw) return new Response(JSON.stringify({ found: false }), {
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
    });
    return new Response(JSON.stringify({ found: true, data: JSON.parse(raw) }), {
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders() });
  }
}

async function handleScheduledReminders(env) {
  try {
    const webpush = require('web-push');
    webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY || '', env.VAPID_PRIVATE_KEY);

    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    // Get all reminders from KV (stored as reminders:* keys)
    const reminders = await env.IBS_BACKUP.list({ prefix: 'reminders:' });

    for (const key of reminders.keys) {
      const userId = key.name.split(':')[1];
      const remindersRaw = await env.IBS_BACKUP.get(key.name);
      if (!remindersRaw) continue;

      const userReminders = JSON.parse(remindersRaw);
      const due = userReminders.filter(r => r.enabled && r.hour === currentHour && r.minute === currentMinute);

      if (due.length === 0) continue;

      const subRaw = await env.IBS_BACKUP.get(`sub:${userId}`);
      if (!subRaw) continue;

      const subscription = JSON.parse(subRaw);
      for (const reminder of due) {
        try {
          await webpush.sendNotification(subscription, JSON.stringify({
            title: 'IBS Tracker',
            body: reminder.type === 'symptom'
              ? "Time to log your symptoms!"
              : "Time to log what you ate!",
          }));
        } catch (err) {
          if (err.statusCode === 410) {
            await env.IBS_BACKUP.delete(`sub:${userId}`);
          }
        }
      }
    }

    return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders() });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders() });
  }
}

async function handleSaveReminders(request, env) {
  try {
    const { userId, reminders } = await request.json();
    if (!userId || !reminders) return new Response('Missing userId or reminders', { status: 400 });
    await env.IBS_BACKUP.put(`reminders:${userId}`, JSON.stringify(reminders));
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders() });
  }
}

async function handleSaveSubscription(request, env) {
  try {
    const { userId, subscription } = await request.json();
    if (!userId || !subscription) return new Response('Missing userId or subscription', { status: 400 });
    await env.IBS_BACKUP.put(`sub:${userId}`, JSON.stringify(subscription), { expirationTtl: 2592000 }); // 30 days
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders() });
  }
}

async function handleSendPush(request, env) {
  try {
    const webpush = require('web-push');
    webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY || '', env.VAPID_PRIVATE_KEY);
    const { userId, title, body } = await request.json();
    const subRaw = await env.IBS_BACKUP.get(`sub:${userId}`);
    if (!subRaw) return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders() });
    const subscription = JSON.parse(subRaw);
    try {
      await webpush.sendNotification(subscription, JSON.stringify({ title, body }));
    } catch (err) {
      if (err.statusCode === 410) {
        await env.IBS_BACKUP.delete(`sub:${userId}`);
      }
    }
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders() });
  }
}

async function handleFetch(request) {
  const url = new URL(request.url);
  const targetUrl = url.searchParams.get('url');
  if (!targetUrl) return new Response('Missing url', { status: 400 });

  try {
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    const text = await response.text();
    return new Response(text, {
      status: response.status,
      headers: { 'Content-Type': 'text/html' },
    });
  } catch (err) {
    return new Response(err.message, { status: 500 });
  }
}
