import type { Prefs } from '../state/prefs.ts';

let audio: AudioContext | null = null;

function tone(freqs: number[], ms: number): void {
  try {
    audio ??= new AudioContext();
    const t0 = audio.currentTime;
    freqs.forEach((f, i) => {
      const o = audio!.createOscillator();
      const g = audio!.createGain();
      o.frequency.value = f;
      o.type = 'sine';
      g.gain.setValueAtTime(0.0001, t0 + (i * ms) / 1000);
      g.gain.exponentialRampToValueAtTime(0.12, t0 + (i * ms) / 1000 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + ((i + 1) * ms) / 1000);
      o.connect(g).connect(audio!.destination);
      o.start(t0 + (i * ms) / 1000);
      o.stop(t0 + ((i + 1) * ms) / 1000 + 0.02);
    });
  } catch {
    /* audio unavailable: silent is fine */
  }
}

/** Optional sound and haptics. Both are off-switchable and silently do nothing where unsupported. */
export function cue(kind: 'right' | 'wrong' | 'done', prefs: Pick<Prefs, 'sound' | 'haptics'>): void {
  if (prefs.haptics) {
    try {
      navigator.vibrate?.(kind === 'right' ? 15 : kind === 'wrong' ? [30, 40, 30] : [20, 30, 20, 30, 40]);
    } catch {
      /* not supported (iOS Safari) */
    }
  }
  if (prefs.sound) tone(kind === 'right' ? [660, 880] : kind === 'wrong' ? [220] : [523, 659, 784], 110);
}
