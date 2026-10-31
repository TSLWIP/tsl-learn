export const SCHEMA_VERSION = 2;
export const DB_NAME = 'tsl-learn';

export type Grade = 'again' | 'hard' | 'good' | 'easy';
export type QuizMode = 'sign-to-meaning' | 'meaning-to-sign' | 'typed' | 'matching' | 'flashcard';

export interface SignProgress {
  id: string; // lexicon entry id
  schemaVersion: number;
  ease: number;
  intervalDays: number;
  /** epoch ms when next due */
  dueAt: number;
  reps: number;
  lapses: number;
  /** epoch ms of the first review; used for the daily new-sign cap */
  introducedAt?: number;
}

export interface ReviewEvent {
  id?: number;
  schemaVersion: number;
  signId: string;
  at: number;
  grade: Grade;
  mode: QuizMode;
}

export interface Deck {
  id: string;
  schemaVersion: number;
  name: string;
  signIds: string[];
}

export interface CachedClip {
  video: string;
  blob: Blob;
  size: number;
  cachedAt: number;
}

export interface ErrorRecord {
  id?: number;
  at: number;
  where: string;
  message: string;
  stack?: string;
}

/** Shape written by the first release (schema 1), kept only so migrations can be tested. */
export interface SignProgressV1 {
  sign: string;
  ef: number;
  interval: number;
  /** YYYY-MM-DD */
  due: string;
  n: number;
}
