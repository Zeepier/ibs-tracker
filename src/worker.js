export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 200, headers: corsHeaders() });
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
