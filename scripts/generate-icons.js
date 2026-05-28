/**
 * Generates PWA icons using pngjs (already a transitive dep).
 * Produces icon-192.png and icon-512.png in web-build/.
 *
 * Design: deep-green rounded square, white stylised gut (inverted-U tube) + 3 tracking dots.
 */

const path = require('path');
const fs   = require('fs');
const { PNG } = require(path.join(__dirname, '..', 'node_modules', 'pngjs'));

const OUT = path.join(__dirname, '..', 'web-build');

// ── helpers ────────────────────────────────────────────────────────────────────

function inRoundedRect(x, y, size, R) {
  if (x < 0 || x >= size || y < 0 || y >= size) return false;
  const inCorner = (x < R || x >= size - R) && (y < R || y >= size - R);
  if (!inCorner) return true;
  const cx = x < R ? R : size - R - 1;
  const cy = y < R ? R : size - R - 1;
  return (x - cx) ** 2 + (y - cy) ** 2 <= R * R;
}

function setPixel(data, size, x, y, r, g, b, a) {
  if (x < 0 || x >= size || y < 0 || y >= size) return;
  const i = (y * size + x) * 4;
  data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = a;
}

// ── icon generator ─────────────────────────────────────────────────────────────

function createIcon(size) {
  const png = new PNG({ width: size, height: size });
  const d   = size / 512;   // scale factor

  // Layout (at 512px, scaled by d)
  const R         = Math.round(96  * d);   // background corner radius
  const leftX     = Math.round(156 * d);
  const rightX    = Math.round(356 * d);
  const arcCX     = Math.round(256 * d);
  const arcCY     = Math.round(210 * d);   // centre of the top dome
  const arcR      = Math.round(100 * d);   // (rightX-leftX)/2
  const legBottom = Math.round(390 * d);
  const sw        = Math.round(52  * d);   // stroke width
  const hs        = sw / 2;

  const dotR  = Math.round(22  * d);
  const dotY  = Math.round(438 * d);
  const dots  = [
    { x: Math.round(176 * d), y: dotY },
    { x: Math.round(256 * d), y: dotY },
    { x: Math.round(336 * d), y: dotY },
  ];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;

      // Outside the rounded-square background → transparent
      if (!inRoundedRect(x, y, size, R)) {
        png.data[idx] = png.data[idx + 1] = png.data[idx + 2] = png.data[idx + 3] = 0;
        continue;
      }

      // Default: green background  #2E7D32 = 46,125,50
      let r = 46, g = 125, b = 50;

      // ── white gut shape ──────────────────────────────────────────────────────

      let white = false;

      // Left vertical leg
      if (!white && Math.abs(x - leftX) <= hs && y >= arcCY && y <= legBottom)
        white = true;

      // Right vertical leg
      if (!white && Math.abs(x - rightX) <= hs && y >= arcCY && y <= legBottom)
        white = true;

      // Top dome arc (upper half of circle)
      if (!white && y <= arcCY) {
        const dist = Math.sqrt((x - arcCX) ** 2 + (y - arcCY) ** 2);
        if (Math.abs(dist - arcR) <= hs) white = true;
      }

      // Three tracking dots
      if (!white) {
        for (const dot of dots) {
          if ((x - dot.x) ** 2 + (y - dot.y) ** 2 <= dotR * dotR) {
            white = true; break;
          }
        }
      }

      if (white) { r = 255; g = 255; b = 255; }

      png.data[idx] = r; png.data[idx + 1] = g; png.data[idx + 2] = b; png.data[idx + 3] = 255;
    }
  }
  return png;
}

// ── write icon files ───────────────────────────────────────────────────────────

for (const size of [192, 512]) {
  const png  = createIcon(size);
  const file = path.join(OUT, `icon-${size}.png`);
  const buf  = PNG.sync.write(png);
  fs.writeFileSync(file, buf);
  console.log(`Wrote ${file}  (${buf.length} bytes)`);
}

// ── patch manifest.json ────────────────────────────────────────────────────────
// expo export:web regenerates manifest.json, so we fix it post-build

const manifestPath = path.join(OUT, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

manifest.icons = [
  { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
  { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
];
manifest.prefer_related_applications = false;
delete manifest.related_applications;

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log('Patched manifest.json with icons and prefer_related_applications=false');
