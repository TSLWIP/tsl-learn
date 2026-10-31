export type Dialect = 'north' | 'south' | 'both';

export interface LexEntry {
  id: string;
  chinese: string | null;
  /** english[0] is the primary gloss, the rest are synonyms */
  english: string[];
  category: string;
  dialect: Dialect;
  /** required whenever the primary English gloss maps to more than one entry and dialect does not tell them apart */
  senseLabel?: string;
  /** path relative to the content source root */
  video: string;
  sourceUrl: string;
  licenseNote: string;
}

export interface LexCategory {
  id: string;
  en: string;
  zh: string;
}

export interface Lexicon {
  schemaVersion: 1;
  /** hash of entries + clip list; the app compares this with cached clips */
  buildId: string;
  categories: LexCategory[];
  entries: LexEntry[];
}

export interface ValidationIssue {
  rule: 'missing-clip' | 'duplicate-id' | 'no-gloss' | 'ambiguous-english';
  id: string;
  message: string;
}
