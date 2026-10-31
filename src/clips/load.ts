import type { AppContext } from '../boot/boot.ts';
import { clipUrl } from '../config.ts';

const sizeCache = new WeakMap<object, Map<string, number>>();

export function expectedSize(ctx: Pick<AppContext, 'manifest'>, video: string): number | undefined {
  let m = sizeCache.get(ctx.manifest);
  if (!m) {
    m = new Map(ctx.manifest.clips.map((c) => [c.video, c.size]));
    sizeCache.set(ctx.manifest, m);
  }
  return m.get(video);
}

export type ClipResult = { ok: true; blob: Blob; fromCache: boolean } | { ok: false; reason: string };

/**
 * Returns the clip from the offline cache if it is intact, otherwise downloads it (politely, ahead of any bulk
 * download) and caches it. A wrong-size cached copy is discarded, never played.
 */
export async function loadClip(
  ctx: Pick<AppContext, 'repo' | 'manifest' | 'source' | 'fetcher'>,
  video: string,
  priority: 'high' | 'low' = 'high',
): Promise<ClipResult> {
  const want = expectedSize(ctx, video);
  if (ctx.repo) {
    try {
      const hit = await ctx.repo.getClip(video);
      if (hit && (want === undefined || hit.blob.size === want)) return { ok: true, blob: hit.blob, fromCache: true };
      if (hit) await ctx.repo.deleteClip(video);
    } catch {
      /* cache unreadable: fall through to the network */
    }
  }
  const r = await ctx.fetcher.fetchBlob(clipUrl(ctx.source, video), want, priority);
  if (!r.ok) return { ok: false, reason: r.reason };
  try {
    await ctx.repo?.putClip({ video, blob: r.blob, size: r.blob.size, cachedAt: Date.now() });
  } catch {
    /* storage full or unavailable: still play it */
  }
  return { ok: true, blob: r.blob, fromCache: false };
}

/** Warms the cache for clips likely to be needed next, without ever blocking the one being watched. */
export function prefetchClips(ctx: Parameters<typeof loadClip>[0], videos: string[]): void {
  for (const v of videos) void loadClip(ctx, v, 'low').catch(() => undefined);
}
