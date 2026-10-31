import { clipUrl, type ContentSource } from '../config.ts';
import type { Manifest } from './pack.ts';

export interface SourceCheck {
  ok: boolean;
  message: string;
}

/**
 * Fetches one clip from the configured source and says, in plain words, what is wrong if it fails. A browser
 * reports "host does not allow other sites" (CORS), "host is offline" and "wrong address" all as the same
 * network error, so the message names every cause the person can check.
 */
export async function testClipSource(source: ContentSource, manifest: Manifest, fetchFn: typeof fetch = fetch): Promise<SourceCheck> {
  const clip = manifest.clips[0];
  if (!clip) return { ok: false, message: 'The sign list has no clips to test with.' };
  const url = clipUrl(source, clip.video);
  const t0 = Date.now();
  try {
    const r = await fetchFn(url, { cache: 'no-store' });
    if (r.status === 404) {
      return { ok: false, message: `The clip host answered, but there is no file at ${url}. Files must be laid out like ${clip.video} under ${source.baseUrl}` };
    }
    if (!r.ok) return { ok: false, message: `The clip host answered with an error (HTTP ${r.status}) for ${url}.` };
    const blob = await r.blob();
    if (blob.size !== clip.size) {
      return {
        ok: false,
        message: `The clip host is reachable, but ${clip.video} is ${blob.size} bytes and the sign list expects ${clip.size}. The files on the host are not the same set the app was built for.`,
      };
    }
    return { ok: true, message: `The clip source works: ${clip.video} (${Math.round(blob.size / 1024)} KB) came back in ${Date.now() - t0} ms from ${source.baseUrl}` };
  } catch {
    return {
      ok: false,
      message:
        `Could not download ${url}. Check that the address is right and the host is online, and that it allows other websites to download its files ` +
        `(it must send the header "Access-Control-Allow-Origin: *"; GitHub Pages does).`,
    };
  }
}
