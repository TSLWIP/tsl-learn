import { clipUrl, type ContentSource } from '../config.ts';
import type { Repo } from '../storage/repo.ts';
import type { PoliteFetcher } from './fetcher.ts';

export interface Manifest {
  buildId: string;
  clips: { video: string; size: number }[];
}

export interface PackCheck {
  ok: string[];
  missing: string[];
  /** cached, but the stored bytes do not match the manifest (truncated, or from an older build) */
  corrupt: string[];
  /** wanted, but not in the manifest any more */
  unknown: string[];
}

export async function checkClips(repo: Repo, manifest: Manifest, wanted: string[]): Promise<PackCheck> {
  const sizes = await repo.clipSizes();
  const expected = new Map(manifest.clips.map((c) => [c.video, c.size]));
  const out: PackCheck = { ok: [], missing: [], corrupt: [], unknown: [] };
  for (const v of wanted) {
    const want = expected.get(v);
    if (want === undefined) out.unknown.push(v);
    else if (!sizes.has(v)) out.missing.push(v);
    else if (sizes.get(v) !== want) out.corrupt.push(v);
    else out.ok.push(v);
  }
  return out;
}

export interface RepairResult {
  fixed: string[];
  failed: { video: string; reason: string }[];
}

/** Downloads only the listed clips. Stops early if the fetcher's circuit breaker trips. */
export async function downloadClips(
  repo: Repo,
  fetcher: PoliteFetcher,
  source: ContentSource,
  manifest: Manifest,
  videos: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<RepairResult> {
  const sizes = new Map(manifest.clips.map((c) => [c.video, c.size]));
  const res: RepairResult = { fixed: [], failed: [] };
  let done = 0;
  const work = async (video: string) => {
    const r = await fetcher.fetchBlob(clipUrl(source, video), sizes.get(video));
    if (r.ok) {
      await repo.putClip({ video, blob: r.blob, size: r.blob.size, cachedAt: Date.now() });
      res.fixed.push(video);
    } else {
      res.failed.push({ video, reason: r.reason });
    }
    onProgress?.(++done, videos.length);
  };
  // Keep the fetcher's own queue full without starting thousands of promises at once.
  const queue = [...videos];
  const lanes = Array.from({ length: source.maxConcurrent }, async () => {
    while (queue.length) {
      const v = queue.shift()!;
      if (fetcher.tripped) {
        res.failed.push({ video: v, reason: 'tripped' });
        onProgress?.(++done, videos.length);
        continue;
      }
      await work(v);
    }
  });
  await Promise.all(lanes);
  return res;
}
