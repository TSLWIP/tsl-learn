// Builds a ready-to-publish folder of clips for a separate static host (for example a second GitHub Pages repo).
//   node scripts/prepare-clips-site.mjs [--src clips-360] [--out ../TSL-Learn-clips] [--check-only]
// Every clip in public/data/manifest.json must exist with exactly the size the app expects, with exactly the right
// letter case (GitHub Pages is case-sensitive, Windows is not). Nothing is copied unless every check passes.
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const args = process.argv.slice(2);
const opt = (name, dflt) => (args.includes(name) ? args[args.indexOf(name) + 1] : dflt);
const src = resolve(opt('--src', 'clips-360'));
const out = resolve(opt('--out', '../TSL-Learn-clips'));
const checkOnly = args.includes('--check-only');

const manifest = JSON.parse(readFileSync('public/data/manifest.json', 'utf8'));
const namesIn = new Map(); // directory -> exact file names on disk
const names = (dir) => {
  if (!namesIn.has(dir)) namesIn.set(dir, existsSync(dir) ? new Set(readdirSync(dir)) : new Set());
  return namesIn.get(dir);
};

const problems = [];
let bytes = 0;
for (const { video, size } of manifest.clips) {
  const [folder, ...rest] = video.split('/');
  const file = rest.join('/');
  if (!names(src).has(folder) || !names(join(src, folder)).has(file)) {
    problems.push(`missing (or different letter case): ${video}`);
    continue;
  }
  const actual = statSync(join(src, video)).size;
  if (actual !== size) problems.push(`wrong size: ${video} is ${actual} bytes, the app expects ${size}`);
  bytes += actual;
}
const total = manifest.clips.length;
console.log(`${total - problems.length} of ${total} clips verified (${(bytes / 1e6).toFixed(0)} MB)`);
if (problems.length) {
  console.error(problems.slice(0, 20).join('\n') + (problems.length > 20 ? `\n...and ${problems.length - 20} more` : ''));
  process.exit(1);
}
if (checkOnly) process.exit(0);

for (const { video } of manifest.clips) {
  const to = join(out, video);
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(join(src, video), to);
}
writeFileSync(join(out, '.nojekyll'), '');
writeFileSync(
  join(out, 'README.md'),
  `# TSL Learn clips

Re-encoded sign clips (360p H.264, no audio) used by the TSL Learn study app. The files are laid out as
\`<letter>/<name>.mp4\` and must stay exactly as they are: the app checks each file's size.

**Source and credit:** the clips come from the Taiwan Sign Language Online Dictionary (台灣手語線上辭典), National
Chung Cheng University, https://twtsl.ccu.edu.tw/ . They carry the "TSL@CCU" mark. This is not an official mirror and
is not affiliated with the university.

**Permission:** the dictionary does not publish reuse terms. Only publish this folder if you have permission from
the rights holder. If you are the rights holder and want these files removed, delete the repository or open an issue.
`,
);
writeFileSync(
  join(out, 'index.html'),
  '<!doctype html><meta charset="utf-8"><title>TSL Learn clips</title><p style="font-family:system-ui;padding:24px">Static clip files for the TSL Learn study app. Sign clips from the Taiwan Sign Language Online Dictionary, National Chung Cheng University (https://twtsl.ccu.edu.tw/). See README.md.</p>\n',
);
console.log(`clip site written to ${out}`);
