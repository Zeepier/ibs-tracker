/**
 * Local dev proxy — mirrors the Cloudflare Worker's /claude and /fetch routes
 * so the app works at localhost without the deployed worker.
 *
 * Run:  ANTHROPIC_API_KEY=sk-... node scripts/local-proxy.js
 * Listens on http://localhost:3001
 */

const http = require('http');
const https = require('https');

const PORT = 3001;
const API_KEY = process.env.ANTHROPIC_API_KEY;

if (!API_KEY) {
  console.error('ERROR: ANTHROPIC_API_KEY environment variable is not set.');
  process.exit(1);
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
}

const server = http.createServer((req, res) => {
  cors(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  // ── /claude → Anthropic Messages API ────────────────────────────────────────
  if (url.pathname === '/claude' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', () => {
      const upstream = https.request(
        'https://api.anthropic.com/v1/messages',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': API_KEY,
            'anthropic-version': '2023-06-01',
          },
        },
        upRes => {
          let data = '';
          upRes.on('data', c => (data += c));
          upRes.on('end', () => {
            res.writeHead(upRes.statusCode, { 'Content-Type': 'application/json' });
            res.end(data);
          });
        }
      );
      upstream.on('error', err => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      });
      upstream.write(body);
      upstream.end();
    });
    return;
  }

  // ── /fetch?url= → fetch a recipe page ───────────────────────────────────────
  if (url.pathname === '/fetch' && req.method === 'GET') {
    const target = url.searchParams.get('url');
    if (!target) {
      res.writeHead(400);
      res.end('Missing url');
      return;
    }
    https
      .get(
        target,
        {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          },
        },
        upRes => {
          let data = '';
          upRes.on('data', c => (data += c));
          upRes.on('end', () => {
            res.writeHead(upRes.statusCode, { 'Content-Type': 'text/html' });
            res.end(data);
          });
        }
      )
      .on('error', err => {
        res.writeHead(500);
        res.end(err.message);
      });
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`Local proxy running at http://localhost:${PORT}`);
  console.log('Routes: POST /claude, GET /fetch?url=');
});
