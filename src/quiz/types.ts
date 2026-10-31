import type { LexEntry } from '../lexicon/types.ts';
import type { QuizMode } from '../storage/types.ts';

export type { QuizMode };

/** One thing to learn: a word, represented by the sign chosen for the learner's dialect. */
export interface Unit {
  entry: LexEntry;
  /** normalised primary gloss, shared by all variants of the word */
  key: string;
}

export type Lang = 'en' | 'zh';

export type Question =
  | { mode: 'sign-to-meaning'; target: LexEntry; options: LexEntry[]; lang: Lang; graded: boolean }
  | { mode: 'meaning-to-sign'; target: LexEntry; options: LexEntry[]; graded: boolean }
  | { mode: 'typed'; target: LexEntry; graded: boolean }
  /** intro: shown when a new sign is first met; no grading, no SRS change */
  | { mode: 'flashcard'; target: LexEntry; intro: boolean; graded: boolean }
  | { mode: 'matching'; pairs: { entry: LexEntry; graded: boolean }[]; graded: true };

export type QuizLangPref = 'mixed' | 'en' | 'zh';
