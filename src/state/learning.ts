import type { Confusions } from '../quiz/distractors.ts';
import type { ProgressMap } from '../quiz/session.ts';
import type { Repo } from '../storage/repo.ts';
import { SCHEMA_VERSION, type Deck } from '../storage/types.ts';

export async function loadProgress(repo: Repo | null): Promise<ProgressMap> {
  if (!repo) return new Map();
  const rows = await repo.allProgress();
  return new Map(rows.map((p) => [p.id, p]));
}

const CONF_KEY = 'confusions';

export async function loadConfusions(repo: Repo | null): Promise<Confusions> {
  const raw = repo ? await repo.getMeta<unknown>(CONF_KEY) : undefined;
  const out: Confusions = {};
  if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw)) if (Array.isArray(v)) out[k] = v.filter((x): x is string => typeof x === 'string');
  }
  return out;
}
export async function saveConfusions(repo: Repo | null, c: Confusions): Promise<void> {
  await repo?.setMeta(CONF_KEY, c);
}

export function makeDeck(name: string): Deck {
  return { id: `deck-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, schemaVersion: SCHEMA_VERSION, name: name.trim().slice(0, 40) || 'My deck', signIds: [] };
}

export function toggleInDeck(deck: Deck, signId: string): Deck {
  const has = deck.signIds.includes(signId);
  return { ...deck, signIds: has ? deck.signIds.filter((x) => x !== signId) : [...deck.signIds, signId] };
}
