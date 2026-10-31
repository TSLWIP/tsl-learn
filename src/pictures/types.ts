export type PictureKind = 'hand' | 'place';

/** One drawing, keyed by the number at the start of its dictionary code. */
export interface PictureInfo {
  /** readable name: "雞" for a hand shape, "palm" for a location */
  label: string;
  /** path relative to the app, e.g. "pictures/hand/209.jpg"; missing when there is no drawing yet */
  file?: string;
  /** true when the file is a replacement drawing from public/pictures/custom */
  custom?: boolean;
}

export interface Pictures {
  schemaVersion: 1;
  hands: Record<string, PictureInfo>;
  places: Record<string, PictureInfo>;
  /** per sign: h = [[drawing number, which hand (1 or 2), location slot]], p = [location drawing numbers] */
  signs: Record<string, { h?: [string, number, number][]; p?: string[] }>;
}

export interface SignPicture {
  kind: PictureKind;
  number: string;
  label: string;
  file?: string;
  custom?: boolean;
  /** "Hand 1" / "Hand 2" when the sign uses two different hand shapes */
  hand?: number;
}

export function isPictures(x: unknown): x is Pictures {
  const p = x as Pictures | null;
  return !!p && p.schemaVersion === 1 && !!p.hands && !!p.places && !!p.signs;
}

/** The drawings to show for one sign, in a fixed order: hand shapes first, then locations. */
export function picturesFor(pictures: Pictures | null, id: string): { hands: SignPicture[]; places: SignPicture[] } {
  const none = { hands: [], places: [] };
  const s = pictures?.signs[id];
  if (!pictures || !s) return none;
  const twoHands = new Set((s.h ?? []).map((x) => x[1])).size > 1;
  const hands = (s.h ?? []).flatMap(([number, hand]) => {
    const info = pictures.hands[number];
    return info ? [{ kind: 'hand' as const, number, ...info, ...(twoHands ? { hand } : {}) }] : [];
  });
  const places = (s.p ?? []).flatMap((number) => {
    const info = pictures.places[number];
    return info ? [{ kind: 'place' as const, number, ...info }] : [];
  });
  return { hands, places };
}
