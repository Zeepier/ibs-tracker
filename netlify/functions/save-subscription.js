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

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors(), body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };

  try {
    const { subscription, reminders, timezoneOffset } = JSON.parse(event.body);
    // Stable key derived from the push endpoint URL
    const key = 'sub:' + Buffer.from(subscription.endpoint).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 64);
    await redis('SET', key, JSON.stringify({ subscription, reminders, timezoneOffset, updatedAt: Date.now() }));
    return { statusCode: 200, headers: cors(), body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error('save-subscription error:', err);
    return { statusCode: 500, headers: cors(), body: JSON.stringify({ error: err.message }) };
  }
};

function cors() {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
}
