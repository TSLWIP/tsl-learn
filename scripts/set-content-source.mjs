// Deploy-time switch for where clips come from, without touching code:
//   CLIP_BASE_URL=https://example.org/tsl-clips/ node scripts/set-content-source.mjs [dist]
// Writes dist/content-source.json. Refuses anything that is not an absolute https URL ending in "/".
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dist = process.argv[2] ?? 'dist';
const url = process.env.CLIP_BASE_URL ?? '';
if (!/^https:\/\/[^\s]+\/$/.test(url)) {
  console.error(`CLIP_BASE_URL must be an absolute https URL ending in "/", got: "${url}"`);
  process.exit(1);
}
const file = join(dist, 'content-source.json');
const current = JSON.parse(readFileSync(file, 'utf8'));
writeFileSync(file, JSON.stringify({ ...current, baseUrl: url }, null, 2) + '\n');
console.log(`clips will be fetched from ${url}`);
