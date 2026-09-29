import { expect, it } from 'vitest';
import { DEFAULT_SETTINGS, normalizeSettings, rgb } from './settings';
import { normalizeCharacters } from './glyphAtlas';

it('clamps image controls, rounds resolution, and repairs nonfinite input', () => {
  expect(normalizeSettings({ ...DEFAULT_SETTINGS, columns: 900, gamma: 0, opacity: -1, brightness: NaN, contrast: 9 })).toMatchObject({ columns: 500, gamma: .2, opacity: 0, brightness: 1, contrast: 3 });
  expect(normalizeSettings({ ...DEFAULT_SETTINGS, columns: 180.7 }).columns).toBe(181);
});
it('preserves spaces, removes duplicate glyphs, and rejects unusable sets', () => {
  expect(normalizeCharacters(' .@@#')).toBe(' .@#');
  for (const input of ['', ' ', 'aaaa', '\n@', '🙂@']) expect(() => normalizeCharacters(input)).toThrow();
});
it('validates color inputs and converts valid colors to uniforms', () => {
  expect(normalizeSettings({ ...DEFAULT_SETTINGS, foregroundColor: 'oops' }).foregroundColor).toBe('#ffffff');
  expect(rgb('#ff8000')).toEqual([1, 128 / 255, 0]);
});
