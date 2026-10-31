import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const run = (url: string | undefined) => {
  const dir = mkdtempSync(join(tmpdir(), 'tsl-dist-'));
  writeFileSync(join(dir, 'content-source.json'), JSON.stringify({ baseUrl: 'clips/', maxConcurrent: 2, minGapMs: 250 }));
  const r = spawnSync(process.execPath, ['scripts/set-content-source.mjs', dir], { env: { ...process.env, CLIP_BASE_URL: url ?? '' }, encoding: 'utf8' });
  return { status: r.status, out: JSON.parse(readFileSync(join(dir, 'content-source.json'), 'utf8')) };
};

describe('scripts/set-content-source.mjs (deploy-time clip host)', () => {
  it('points the site at an https clip host and keeps the politeness settings', () => {
    const r = run('https://example.org/tsl-clips/');
    expect(r.status).toBe(0);
    expect(r.out).toEqual({ baseUrl: 'https://example.org/tsl-clips/', maxConcurrent: 2, minGapMs: 250 });
  });
  it.each(['', 'http://insecure.example/clips/', 'https://example.org/no-trailing-slash', 'clips/', 'javascript:alert(1)//'])('refuses %j and leaves the file alone', (bad) => {
    const r = run(bad);
    expect(r.status).toBe(1);
    expect(r.out.baseUrl).toBe('clips/');
  });
});
