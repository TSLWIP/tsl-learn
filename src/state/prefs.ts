import type { Repo } from '../storage/repo.ts';

export type Speed = 0.5 | 0.75 | 1;

export interface Prefs {
  /** which dialect's sign is shown first when a word has both */
  dialect: 'north' | 'south';
  speed: Speed;
  /** normalised English gloss (or "zh:<chinese>") -> entry id the learner prefers */
  pins: Record<string, string>;
  /** how many new signs "Learn new" introduces per day */
  newPerDay: number;
  sound: boolean;
  haptics: boolean;
  /** which text multiple-choice quizzes show */
  quizLang: 'mixed' | 'en' | 'zh';
}

export const DEFAULT_PREFS: Prefs = { dialect: 'north', speed: 1, pins: {}, newPerDay: 5, sound: false, haptics: true, quizLang: 'mixed' };

export interface MissingFlag {
  word: string;
  at: number;
}

const PREFS_KEY = 'prefs';
const FLAGS_KEY = 'missingFlags';

export function sanitizePrefs(raw: unknown): Prefs {
  const r = (raw ?? {}) as Partial<Prefs>;
  const pins: Record<string, string> = {};
  if (r.pins && typeof r.pins === 'object') {
    for (const [k, v] of Object.entries(r.pins)) if (typeof v === 'string') pins[k] = v;
  }
  return {
    dialect: r.dialect === 'south' ? 'south' : 'north',
    speed: r.speed === 0.5 || r.speed === 0.75 ? r.speed : 1,
    pins,
    newPerDay: Number.isFinite(r.newPerDay) ? Math.min(30, Math.max(1, Math.round(r.newPerDay as number))) : DEFAULT_PREFS.newPerDay,
    sound: r.sound === true,
    haptics: r.haptics !== false,
    quizLang: r.quizLang === 'en' || r.quizLang === 'zh' ? r.quizLang : 'mixed',
  };
}

export async function loadPrefs(repo: Repo): Promise<Prefs> {
  return sanitizePrefs(await repo.getMeta(PREFS_KEY));
}
export async function savePrefs(repo: Repo, prefs: Prefs): Promise<void> {
  await repo.setMeta(PREFS_KEY, prefs);
}

export async function loadFlags(repo: Repo): Promise<MissingFlag[]> {
  const raw = await repo.getMeta<unknown>(FLAGS_KEY);
  return Array.isArray(raw)
    ? raw.filter((f): f is MissingFlag => !!f && typeof (f as MissingFlag).word === 'string' && typeof (f as MissingFlag).at === 'number')
    : [];
}
export async function saveFlags(repo: Repo, flags: MissingFlag[]): Promise<void> {
  await repo.setMeta(FLAGS_KEY, flags);
}
