// Draws the app icons: a brass King on dark slate. Run `npx tsx tools/make-icons.ts` after changing
// the design; the PNGs and the SVG are committed under public/icons, so the build never needs this.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

// the King silhouette from src/ui/pieces.tsx (24-unit grid)
const KING =
  'M10.8 1.4h2.4v1.9h2v2.3h-2v1.9h-2.4V5.6h-2V3.3h2z M12 9.2c-3.5 0-6.2 1.9-6.2 4.8 0 1.4.7 2.5 1.8 3.3L6.4 20.2h11.2l-1.2-2.9c1.1-.8 1.8-1.9 1.8-3.3 0-2.9-2.7-4.8-6.2-4.8z M5 20.2h14v2.4H5z';

/** The icon as SVG. `scale` is the King's height as a share of the icon (smaller for maskable). */
function svg(scale: number, ring: boolean): string {
  const size = 512;
  const h = size * scale;
  const k = h / 21.2; // the King spans y 1.4..22.6 on the grid
  const x = size / 2 - 12 * k;
  const y = size / 2 - 12 * k;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <defs>
    <radialGradient id="bg" cx="50%" cy="38%" r="75%">
      <stop offset="0" stop-color="#2b3340"/>
      <stop offset="1" stop-color="#14110e"/>
    </radialGradient>
    <linearGradient id="brass" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f0d58a"/>
      <stop offset="1" stop-color="#b8903f"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" fill="url(#bg)"/>
  ${ring ? `<rect x="22" y="22" width="${size - 44}" height="${size - 44}" rx="70" fill="none" stroke="#7a6330" stroke-width="6"/>` : ''}
  <g transform="translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${k.toFixed(4)})">
    <path d="${KING}" fill="url(#brass)" stroke="#14110e" stroke-width="0.25" stroke-linejoin="round"/>
  </g>
</svg>
`;
}

const OUT = 'public/icons';
mkdirSync(OUT, { recursive: true });
const any = svg(0.72, true);
const maskable = svg(0.5, false); // inside the 80% safe circle, no ring that a mask could clip
writeFileSync(`${OUT}/icon.svg`, any);

const local = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(
  existsSync(local) ? { executablePath: local, args: ['--no-sandbox'] } : {},
);
const page = await browser.newPage();
const shots: [string, string, number][] = [
  ['icon-192.png', any, 192],
  ['icon-512.png', any, 512],
  ['icon-maskable-512.png', maskable, 512],
  ['apple-touch-icon.png', maskable, 180],
  ['favicon-32.png', svg(0.78, false), 32],
];
for (const [name, markup, px] of shots) {
  await page.setViewportSize({ width: px, height: px });
  await page.setContent(
    `<style>html,body{margin:0}svg{display:block;width:${px}px;height:${px}px}</style>${markup}`,
  );
  await page.screenshot({ path: `${OUT}/${name}`, omitBackground: false });
  console.log('wrote', `${OUT}/${name}`);
}
await browser.close();
