/** Where clips come from. Kept separate from app code so hosting can change without a rebuild. */
export interface ContentSource {
  /** Absolute URL, or a path relative to the app (e.g. "clips/"). Must end with "/". */
  baseUrl: string;
  /** Be gentle with third-party servers: never more than this many requests at once... */
  maxConcurrent: number;
  /** ...and never start two requests closer together than this. */
  minGapMs: number;
}

export const DEFAULT_SOURCE: ContentSource = { baseUrl: 'clips/', maxConcurrent: 2, minGapMs: 250 };

export async function loadContentSource(fetchFn: typeof fetch = fetch): Promise<ContentSource> {
  try {
    const r = await fetchFn('content-source.json', { cache: 'no-cache' });
    if (r.ok) {
      const j = (await r.json()) as Partial<ContentSource>;
      const baseUrl = typeof j.baseUrl === 'string' && j.baseUrl ? j.baseUrl.replace(/\/?$/, '/') : DEFAULT_SOURCE.baseUrl;
      return {
        baseUrl,
        maxConcurrent: Math.max(1, Math.min(4, Number(j.maxConcurrent) || DEFAULT_SOURCE.maxConcurrent)),
        minGapMs: Math.max(100, Number(j.minGapMs) || DEFAULT_SOURCE.minGapMs),
      };
    }
  } catch {
    /* offline or missing: fall through to the defaults */
  }
  return DEFAULT_SOURCE;
}

export function clipUrl(source: ContentSource, video: string): string {
  return new URL(source.baseUrl + video.split('/').map(encodeURIComponent).join('/'), document.baseURI).href;
}
