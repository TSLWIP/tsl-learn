import { describe, expect, it } from 'vitest';
import { testClipSource } from '../src/clips/diagnose.ts';

// clipUrl() resolves against document.baseURI, so give the node test a tiny stand-in.
(globalThis as any).document = { baseURI: 'https://app.example/tsl/' };

const manifest = { buildId: 'x', clips: [{ video: 'A/able_n.mp4', size: 5 }] };
const source = { baseUrl: 'https://clips.example/c/', maxConcurrent: 2, minGapMs: 250 };
const reply = (status: number, bytes = 5) => (async () => new Response(status === 200 ? new Uint8Array(bytes) : 'x', { status })) as typeof fetch;

describe('testClipSource', () => {
  it('passes when the right file comes back', async () => {
    const r = await testClipSource(source, manifest, reply(200));
    expect(r.ok).toBe(true);
    expect(r.message).toContain('works');
  });
  it('explains a wrong folder layout (404)', async () => {
    const r = await testClipSource(source, manifest, reply(404));
    expect(r.ok).toBe(false);
    expect(r.message).toContain('no file at https://clips.example/c/A/able_n.mp4');
  });
  it('reports other HTTP errors with the status', async () => {
    expect((await testClipSource(source, manifest, reply(503))).message).toContain('HTTP 503');
  });
  it('notices the host has different files than the sign list expects', async () => {
    const r = await testClipSource(source, manifest, reply(200, 9));
    expect(r.ok).toBe(false);
    expect(r.message).toContain('9 bytes');
    expect(r.message).toContain('expects 5');
  });
  it('names every cause of a network failure, including missing CORS', async () => {
    const r = await testClipSource(source, manifest, (async () => { throw new TypeError('Failed to fetch'); }) as typeof fetch);
    expect(r.ok).toBe(false);
    expect(r.message).toContain('Access-Control-Allow-Origin');
    expect(r.message).toContain('online');
  });
});
