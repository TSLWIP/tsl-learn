// Renders the app icon (the character 手, "hand") to PNGs with Playwright's Chromium. Run: node scripts/make-icons.mjs
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const out = new URL('../public/icons/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
mkdirSync(out, { recursive: true });
const html = (size, pad) => `<!doctype html><body style="margin:0;width:${size}px;height:${size}px;background:#a63a28;display:grid;place-items:center;overflow:hidden">
<div style="font:700 ${Math.round(size * (1 - pad * 2) * 0.82)}px/1 'Microsoft JhengHei','Noto Sans TC','PingFang TC',sans-serif;color:#fffdf9">手</div></body>`;
const browser = await chromium.launch();
for (const [name, size, pad] of [['icon-192.png', 192, 0.08], ['icon-512.png', 512, 0.08], ['icon-maskable-512.png', 512, 0.2], ['apple-touch-icon.png', 180, 0.1]]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(html(size, pad));
  await page.screenshot({ path: out + name });
  await page.close();
}
await browser.close();
console.log('icons written to', out);
