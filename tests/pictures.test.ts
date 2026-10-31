import { describe, expect, it } from 'vitest';
import { buildPictureData, customFiles, pictureLabel, pictureNumber } from '../scripts/build-pictures.ts';
import { picturesFor, type Pictures } from '../src/pictures/types.ts';

describe('picture codes', () => {
  it('uses the leading number as the drawing id and the rest as a readable label', () => {
    expect(pictureNumber('209_雞')).toBe('209');
    expect(pictureNumber('101_一b')).toBe('101');
    expect(pictureNumber('406_菜 ')).toBe('406');
    expect(pictureNumber('WC')).toBeNull();
    expect(pictureLabel('209_雞')).toBe('雞');
    expect(pictureLabel('401_in_front_of_body')).toBe('in front of body');
    expect(pictureLabel('101_一b')).toBe('一');
    expect(pictureLabel('503_九a')).toBe('九');
    expect(pictureLabel('321_WC')).toBe('WC');
  });
});

describe('buildPictureData', () => {
  const none = { hand: new Map<string, string>(), place: new Map<string, string>() };
  const legacy = {
    a: { handshapes: [{ hand: 1, locationSlot: 1, code: '209_雞' }], locations: ['602_palm'] },
    b: { handshapes: [{ hand: 1, locationSlot: 1, code: '101_一b' }, { hand: 2, locationSlot: 1, code: '101_一' }, { hand: 2, locationSlot: 1, code: '209_雞' }], locations: [] },
    c: { handshapes: [], locations: [] },
    gone: { handshapes: [{ hand: 1, locationSlot: 1, code: '209_雞' }], locations: [] },
  };
  const data = buildPictureData(legacy, new Set(['a', 'b', 'c']), none);

  it('keeps one entry per drawing and only the signs that exist and have drawings', () => {
    expect(Object.keys(data.hands).sort()).toEqual(['101', '209']);
    expect(Object.keys(data.places)).toEqual(['602']);
    expect(Object.keys(data.signs).sort()).toEqual(['a', 'b']);
  });
  it('treats the suffix variants of one drawing as the same hand on the same side', () => {
    expect(data.signs.b.h).toEqual([['101', 1, 1], ['101', 2, 1], ['209', 2, 1]]);
  });
});

describe('customFiles', () => {
  it('finds nothing in a folder that does not exist', () => {
    expect(customFiles('does/not/exist').size).toBe(0);
  });
});

describe('picturesFor', () => {
  const pics: Pictures = {
    schemaVersion: 1,
    hands: { 209: { label: '雞', file: 'pictures/hand/209.jpg' }, 101: { label: '一' } },
    places: { 602: { label: 'palm', file: 'pictures/place/602.jpg' } },
    signs: { one: { h: [['209', 1, 1]], p: ['602'] }, two: { h: [['101', 1, 1], ['209', 2, 1]] }, odd: { h: [['999', 1, 1]] } },
  };
  it('returns hand shapes first, then locations', () => {
    const r = picturesFor(pics, 'one');
    expect(r.hands.map((p) => p.number)).toEqual(['209']);
    expect(r.places.map((p) => p.number)).toEqual(['602']);
    expect(r.hands[0].hand).toBeUndefined();
  });
  it('numbers the hands only when the sign uses two different hand shapes', () => {
    expect(picturesFor(pics, 'two').hands.map((p) => p.hand)).toEqual([1, 2]);
  });
  it('is empty without data, for an unknown sign, or for a drawing missing from the table', () => {
    expect(picturesFor(null, 'one')).toEqual({ hands: [], places: [] });
    expect(picturesFor(pics, 'nope')).toEqual({ hands: [], places: [] });
    expect(picturesFor(pics, 'odd').hands).toEqual([]);
  });
});
