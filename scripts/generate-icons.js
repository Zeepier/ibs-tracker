/**
 * Generates PWA icons using pngjs.
 * Design: deep-green rounded square, white leaf with midrib + side veins, small stem.
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

// ── leaf shape: pointed ellipse (more pointed at top) ─────────────────────────

function inLeaf(x, y, cx, cy, halfW, halfH) {
  const u = (x - cx) / halfW;
  const v = (y - cy) / halfH;
  if (v < -1 || v > 1) return false;
  const vNorm = (v + 1) / 2; // 0 at top, 1 at bottom
  const power = vNorm < 0.5 ? 0.55 : 0.9; // pointier at top, rounder at bottom
  const maxU = Math.pow(Math.sin(Math.PI * vNorm), power);
  return Math.abs(u) <= maxU;
}

// ── icon generator ─────────────────────────────────────────────────────────────

function createIcon(size) {
  const png = new PNG({ width: size, height: size });
  const s = size / 512;

  // Background
  const R = Math.round(96 * s);

  // Leaf parameters
  const leafCX  = Math.round(256 * s);
  const leafCY  = Math.round(220 * s);  // slightly above center
  const leafW   = Math.round(118 * s);  // half-width
  const leafH   = Math.round(168 * s);  // half-height

  // Stem: rectangle below leaf
  const stemX1  = Math.round(245 * s);
  const stemX2  = Math.round(267 * s);
  const stemY1  = Math.round(leafCY + leafH - 4 * s);
  const stemY2  = Math.round(leafCY + leafH + 55 * s);

  // Midrib: thin line through leaf center
  const midribW = Math.max(1, Math.round(9 * s));

  // Side veins: 4 pairs
  const veins = [
    { py: -0.55, angle: 38 }, // upper pair
    { py: -0.2,  angle: 42 },
    { py:  0.15, angle: 40 },
    { py:  0.48, angle: 35 }, // lower pair
  ];
  const veinW = Math.max(1, Math.round(5 * s));
  const veinLen = Math.round(62 * s);

  // BG colours
  const BG = [46, 125, 50];    // #2E7D32
  const LEAF = [255, 255, 255]; // white
  const VEIN = [46, 125, 50];  // dark green veins on white leaf

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;

      if (!inRoundedRect(x, y, size, R)) {
        png.data[idx] = png.data[idx+1] = png.data[idx+2] = png.data[idx+3] = 0;
        continue;
      }

      let r = BG[0], g = BG[1], b = BG[2];

      // ── stem ──────────────────────────────────────────────────────────────
      const inStem = x >= stemX1 && x <= stemX2 && y >= stemY1 && y <= stemY2;

      // ── leaf body ──────────────────────────────────────────────────────────
      const isLeaf = inLeaf(x, y, leafCX, leafCY, leafW, leafH);

      if (isLeaf || inStem) {
        r = LEAF[0]; g = LEAF[1]; b = LEAF[2];
      }

      // ── midrib (dark green line on leaf) ──────────────────────────────────
      if (isLeaf && Math.abs(x - leafCX) <= midribW / 2) {
        r = VEIN[0]; g = VEIN[1]; b = VEIN[2];
      }

      // ── side veins ────────────────────────────────────────────────────────
      if (isLeaf) {
        for (const v of veins) {
          const veinY = leafCY + v.py * leafH;
          const rad   = -v.angle * Math.PI / 180; // negative = veins angle upward
          // Right vein
          const dxR = x - leafCX;
          const dyR = y - veinY;
          const distR = Math.abs(-Math.sin(rad) * dxR + Math.cos(rad) * dyR);
          const alongR = Math.cos(rad) * dxR + Math.sin(rad) * dyR;
          if (dxR >= 0 && distR <= veinW / 2 && alongR >= 0 && alongR <= veinLen) {
            r = VEIN[0]; g = VEIN[1]; b = VEIN[2];
          }
          // Left vein (mirror)
          const dxL = x - leafCX;
          const dyL = y - veinY;
          const distL = Math.abs(Math.sin(rad) * dxL + Math.cos(rad) * dyL);
          const alongL = Math.cos(rad) * (-dxL) + Math.sin(rad) * dyL;
          if (dxL <= 0 && distL <= veinW / 2 && alongL >= 0 && alongL <= veinLen) {
            r = VEIN[0]; g = VEIN[1]; b = VEIN[2];
          }
        }
      }

      png.data[idx] = r; png.data[idx+1] = g; png.data[idx+2] = b; png.data[idx+3] = 255;
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

const manifestPath = path.join(OUT, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

manifest.icons = [
  { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
  { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
];
manifest.prefer_related_applications = false;
delete manifest.related_applications;

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log('Patched manifest.json');
