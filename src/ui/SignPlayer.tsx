import { useEffect, useRef, useState } from 'preact/hooks';
import type { AppContext } from '../boot/boot.ts';
import { loadClip } from '../clips/load.ts';
import type { LexEntry } from '../lexicon/types.ts';
import type { Speed } from '../state/prefs.ts';

const SPEEDS: Speed[] = [0.5, 0.75, 1];

interface Props {
  ctx: AppContext;
  entry: LexEntry;
  speed: Speed;
  onSpeed: (s: Speed) => void;
  /** single sign: loop forever. In a sequence: play once, then call onEnded */
  loop?: boolean;
  onEnded?: () => void;
  /** in a quiz the label would give the answer away */
  hideLabel?: boolean;
}

type Status = 'loading' | 'ready' | 'error';

const REASONS: Record<string, string> = {
  network: 'You seem to be offline, and this clip is not saved on this device yet.',
  'not-found': 'The clip file was not found on the server.',
  tripped: 'The server is not answering right now. Try again in a minute.',
  http: 'The server returned an error.',
  'size-mismatch': 'The downloaded clip was incomplete.',
};

/** The hero element: a muted looping clip that starts at once, pauses on tap, and always has its text beside it. */
export function SignPlayer({ ctx, entry, speed, onSpeed, loop = true, onEnded, hideLabel }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [url, setUrl] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [paused, setPaused] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    let made: string | null = null;
    setStatus('loading');
    setUrl(null);
    void loadClip(ctx, entry.video).then((r) => {
      if (!alive) return;
      if (r.ok) {
        made = URL.createObjectURL(r.blob);
        setUrl(made);
        setStatus('ready');
      } else {
        setReason(REASONS[r.reason] ?? 'The clip could not be loaded.');
        setStatus('error');
      }
    });
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [ctx, entry.video, attempt]);

  useEffect(() => {
    if (video.current) video.current.playbackRate = speed;
  }, [speed, url]);

  const play = () => {
    const v = video.current;
    if (!v) return;
    v.playbackRate = speed;
    v.play().then(
      () => setPaused(false),
      () => setPaused(true), // autoplay refused (low-power mode, etc.): show the tap-to-play state
    );
  };
  const toggle = () => {
    const v = video.current;
    if (!v) return;
    if (v.paused) play();
    else {
      v.pause();
      setPaused(true);
    }
  };
  const replay = () => {
    const v = video.current;
    if (!v) return;
    v.currentTime = 0;
    play();
  };

  const label = `${entry.chinese ?? ''} ${entry.english[0] ?? ''}`.trim();

  return (
    <div class="player" data-testid="player">
      <div class="stage">
        {status === 'ready' && url && (
          <video
            ref={video}
            src={url}
            data-testid="player-video"
            aria-label={hideLabel ? 'Sign to identify' : `Sign for ${label}`}
            muted
            playsInline
            autoPlay
            loop={loop}
            preload="auto"
            tabIndex={0}
            onClick={toggle}
            onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && (e.preventDefault(), toggle())}
            onLoadedMetadata={() => video.current && (video.current.playbackRate = speed)}
            onPlay={() => setPaused(false)}
            onEnded={() => onEnded?.()}
            onCanPlay={() => video.current?.paused && !paused && play()}
          />
        )}
        {status === 'loading' && (
          <p class="stage-msg" role="status" data-testid="player-loading">
            Loading clip…
          </p>
        )}
        {status === 'error' && (
          <div class="stage-msg" role="alert" data-testid="player-error">
            <p>This clip could not be loaded.</p>
            <p class="note">{reason}</p>
            <button class="btn" onClick={() => setAttempt((n) => n + 1)}>
              Try again
            </button>
          </div>
        )}
        {status === 'ready' && paused && (
          <button class="tap-play" onClick={play} aria-label="Play">
            ▶
          </button>
        )}
      </div>
      <div class="controls" role="group" aria-label="Playback">
        <button class="btn icon" onClick={toggle} disabled={status !== 'ready'} data-testid="toggle" aria-label={paused ? 'Play' : 'Pause'}>
          {paused ? '▶' : '⏸'}
        </button>
        <button class="btn icon" onClick={replay} disabled={status !== 'ready'} data-testid="replay" aria-label="Replay from the start">
          ↻
        </button>
        <span class="speeds">
          {SPEEDS.map((s) => (
            <button key={s} class="btn" aria-pressed={speed === s} data-testid={`speed-${s}`} onClick={() => onSpeed(s)}>
              {s}×
            </button>
          ))}
        </span>
      </div>
    </div>
  );
}
