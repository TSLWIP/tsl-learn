import { useEffect, useState } from 'preact/hooks';
import type { AppContext } from '../boot/boot.ts';
import { loadClip } from '../clips/load.ts';
import type { LexEntry } from '../lexicon/types.ts';

/** A small autoplaying loop used where several signs are shown at once (answer tiles, matching). */
export function MiniClip({ ctx, entry, label }: { ctx: AppContext; entry: LexEntry; label: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    let made: string | null = null;
    setUrl(null);
    setFailed(false);
    void loadClip(ctx, entry.video).then((r) => {
      if (!alive) return;
      if (r.ok) setUrl((made = URL.createObjectURL(r.blob)));
      else setFailed(true);
    });
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [ctx, entry.video]);

  return (
    <div class="mini" role="img" aria-label={label}>
      {url && <video src={url} muted playsInline autoPlay loop preload="auto" data-testid="mini-video" />}
      {!url && !failed && <span class="note">Loading…</span>}
      {failed && <span class="note">Clip unavailable</span>}
    </div>
  );
}
