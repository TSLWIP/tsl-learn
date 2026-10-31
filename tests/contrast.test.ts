import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('src/ui/styles.css', 'utf8');

const parse = (block: string) =>
  Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]));

const light = parse(css.match(/:root\s*\{([^}]*)\}/)![1]);
const darkAuto = parse(css.match(/:root:not\(\[data-theme='light'\]\)\s*\{([^}]*)\}/)![1]);
const darkManual = parse(css.match(/:root\[data-theme='dark'\]\s*\{([^}]*)\}/)![1]);

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// text on background pairs actually used by the UI
const PAIRS: [string, string][] = [
  ['ink', 'bg'], ['ink', 'card'], ['muted', 'bg'], ['muted', 'card'],
  ['accent', 'bg'], ['accent', 'card'], ['on-accent', 'accent'],
  ['good', 'card'], ['bad', 'card'],
];

describe('colour tokens meet WCAG AA (4.5:1 for text)', () => {
  for (const [name, theme] of [['light', light], ['dark', darkManual]] as const) {
    it(`${name} theme`, () => {
      for (const [fg, bg] of PAIRS) {
        expect(theme[fg], `--${fg} defined`).toBeTruthy();
        expect(contrast(theme[fg], theme[bg]), `${fg} on ${bg} (${theme[fg]} / ${theme[bg]})`).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
  it('chart marks reach 3:1 against the card, and the ordered mastery steps are visibly different', () => {
    for (const [name, theme] of [['light', light], ['dark', darkManual]] as const) {
      for (const m of ['m1', 'm2', 'm3', 'accent']) {
        expect(contrast(theme[m], theme.card), `${name} --${m} on card`).toBeGreaterThanOrEqual(3);
      }
      expect(contrast(theme.m1, theme.m2), `${name} m1 vs m2`).toBeGreaterThanOrEqual(1.3);
      expect(contrast(theme.m2, theme.m3), `${name} m2 vs m3`).toBeGreaterThanOrEqual(1.3);
    }
  });
  it('the automatic dark block matches the manual dark block', () => {
    const strip = ({ ...o }) => o;
    expect(strip(darkAuto)).toEqual(strip(darkManual));
  });
});
