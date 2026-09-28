import { describe, expect, it } from 'vitest';
import { characterGrid, glyphFeatures, normalizeShape } from './glyphAtlas';

describe('ASCII grid and glyph descriptors', () => {
  it('corrects for tall glyphs in landscape and portrait video', () => {
    expect(characterGrid(1920, 1080)).toEqual({ columns: 100, rows: 34 });
    expect(characterGrid(1080, 1920)).toEqual({ columns: 100, rows: 107 });
    expect(characterGrid(1, 10000, 10000)).toEqual({ columns: 200, rows: 400 });
  });
  it('extracts spatial coverage bottom-up rather than losing orientation', () => {
    const pixels = new Uint8ClampedArray(2 * 3 * 4);
    pixels[3] = 255;
    expect(glyphFeatures(pixels, 2, 3)).toEqual([0, 0, 0, 0, 1, 0]);
  });
  it('distinguishes equal-density horizontal and vertical patterns', () => {
    const vertical = normalizeShape([1, 0, 1, 0, 1, 0]);
    const horizontal = normalizeShape([1, 1, 0.5, 0.5, 0, 0]);
    expect(vertical).not.toEqual(horizontal);
    expect(normalizeShape([0, 0, 0, 0, 0, 0])).toEqual([0, 0, 0, 0, 0, 0]);
    expect(normalizeShape([.2, .4, .2, .4, .2, .4])).toEqual(normalizeShape([.1, .2, .1, .2, .1, .2]));
  });
});
