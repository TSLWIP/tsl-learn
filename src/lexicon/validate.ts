import type { LexEntry, ValidationIssue } from './types.ts';

export function normalizeGloss(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Build-time checks from SPEC section 7. `clipExists` is injected so the
 * validator can be unit-tested without touching the disk.
 */
export function validateLexicon(
  entries: LexEntry[],
  clipExists: (video: string) => boolean,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seen = new Set<string>();
  const byPrimary = new Map<string, LexEntry[]>();

  for (const e of entries) {
    if (seen.has(e.id)) {
      issues.push({ rule: 'duplicate-id', id: e.id, message: `duplicate id "${e.id}"` });
    }
    seen.add(e.id);

    const hasEnglish = e.english.some((g) => g.trim() !== '');
    const hasChinese = !!e.chinese && e.chinese.trim() !== '';
    if (!hasEnglish && !hasChinese) {
      issues.push({ rule: 'no-gloss', id: e.id, message: 'entry has no English or Chinese gloss' });
    }

    if (!clipExists(e.video)) {
      issues.push({ rule: 'missing-clip', id: e.id, message: `clip not found: ${e.video}` });
    }

    if (hasEnglish) {
      const key = normalizeGloss(e.english[0]);
      const list = byPrimary.get(key) ?? [];
      list.push(e);
      byPrimary.set(key, list);
    }
  }

  for (const [word, group] of byPrimary) {
    if (group.length < 2) continue;
    // Each member must be tellable apart from the others by a label.
    const labels = group.map((e) => `${e.dialect === 'both' ? '' : e.dialect}|${e.senseLabel ?? ''}`);
    const distinct = new Set(labels).size === group.length;
    const unlabeled = group.filter((e) => e.dialect === 'both' && !e.senseLabel);
    if (!distinct || unlabeled.length > 0) {
      for (const e of group) {
        issues.push({
          rule: 'ambiguous-english',
          id: e.id,
          message: `"${word}" maps to ${group.length} signs without distinct dialect/sense labels`,
        });
      }
    }
  }
  return issues;
}
