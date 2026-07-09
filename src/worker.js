const WORKER_VERSION = '1.1.2';

export default {
  // Cloudflare cron trigger — invoked on the schedule in wrangler.toml
  async scheduled(event, env, ctx) {
    ctx.waitUntil(handleScheduledReminders(env));
  },

  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 200, headers: corsHeaders() });
    }

    // Version check — confirm which build is live
    if (url.pathname === '/version') {
      return new Response(JSON.stringify({ version: WORKER_VERSION }), {
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      });
    }

    // Manual reminder trigger (for testing the cron logic over HTTP)
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
    const now = Date.now();
    const list = await env.IBS_BACKUP.list({ prefix: 'reminders:' });
    let sent = 0;

    for (const key of list.keys) {
      const userId = key.name.slice('reminders:'.length);
      const raw = await env.IBS_BACKUP.get(key.name);
      if (!raw) continue;

      // Support both new { tzOffset, reminders } and legacy bare-array formats
      const parsed = JSON.parse(raw);
      const reminders = Array.isArray(parsed) ? parsed : (parsed.reminders || []);
      const tzOffset = Array.isArray(parsed) ? 0 : (parsed.tzOffset || 0);

      // Workers run in UTC. getTimezoneOffset() is (UTC - local) in minutes,
      // so local wall-clock = UTC - offset. Read it via getUTC* on the shifted date.
      const local = new Date(now - tzOffset * 60000);
      const h = local.getUTCHours();
      const m = local.getUTCMinutes();

      const due = reminders.filter(r => r.enabled && r.hour === h && r.minute === m);
      if (!due.length) continue;

      const subRaw = await env.IBS_BACKUP.get(`sub:${userId}`);
      if (!subRaw) continue;
      const subscription = JSON.parse(subRaw);

      for (const _ of due) {
        try {
          const res = await sendPush(subscription, env);
          if (res.status === 404 || res.status === 410) {
            await env.IBS_BACKUP.delete(`sub:${userId}`);
          } else if (res.ok) {
            sent++;
          }
        } catch (e) {
          // ignore individual send failures
        }
      }
    }

    return new Response(JSON.stringify({ ok: true, sent }), {
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders() });
  }
}

async function handleSaveReminders(request, env) {
  try {
    const { userId, reminders, tzOffset } = await request.json();
    if (!userId || !reminders) return new Response('Missing userId or reminders', { status: 400 });
    await env.IBS_BACKUP.put(`reminders:${userId}`, JSON.stringify({ reminders, tzOffset: tzOffset || 0 }));
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
    const { userId } = await request.json();
    const subRaw = await env.IBS_BACKUP.get(`sub:${userId}`);
    if (!subRaw) {
      return new Response(JSON.stringify({ ok: false, reason: 'no subscription' }), {
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      });
    }
    const subscription = JSON.parse(subRaw);
    const res = await sendPush(subscription, env);
    if (res.status === 404 || res.status === 410) {
      await env.IBS_BACKUP.delete(`sub:${userId}`);
    }
    return new Response(JSON.stringify({ ok: res.ok, status: res.status }), {
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders() });
  }
}

// ── Web Push via VAPID (Web Crypto, payload-less) ─────────────────────────────
// Sends a bodyless push so the service worker shows its default reminder text.
// Avoids the aes128gcm payload encryption that web-push needs — only VAPID
// JWT signing is required, which Web Crypto (ECDSA P-256) supports natively.

function b64urlToBytes(b64url) {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
  const raw = atob(b64 + pad);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function bytesToB64url(buf) {
  const arr = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function strToB64url(str) {
  return bytesToB64url(new TextEncoder().encode(str));
}

async function importVapidKey(privB64url, pubB64url) {
  const pub = b64urlToBytes(pubB64url); // 65 bytes: 0x04 || x(32) || y(32)
  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    d: privB64url,
    x: bytesToB64url(pub.slice(1, 33)),
    y: bytesToB64url(pub.slice(33, 65)),
    ext: true,
  };
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
}

async function makeVapidJwt(audience, env) {
  const header = strToB64url(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const payload = strToB64url(JSON.stringify({
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: env.VAPID_SUBJECT,
  }));
  const unsigned = `${header}.${payload}`;
  const key = await importVapidKey(env.VAPID_PRIVATE_KEY, env.VAPID_PUBLIC_KEY);
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(unsigned)
  );
  return `${unsigned}.${bytesToB64url(sig)}`;
}

async function sendPush(subscription, env) {
  const endpoint = subscription.endpoint;
  const audience = new URL(endpoint).origin;
  const jwt = await makeVapidJwt(audience, env);
  return fetch(endpoint, {
    method: 'POST',
    headers: {
      TTL: '86400',
      Urgency: 'normal',
      Authorization: `vapid t=${jwt}, k=${env.VAPID_PUBLIC_KEY}`,
    },
  });
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
