import { DEFAULT_CHARACTERS, normalizeCharacters } from './glyphAtlas';

export type AsciiSettings = {
  columns: number; brightness: number; contrast: number; gamma: number; opacity: number;
  colorMode: 'color' | 'monochrome'; foregroundColor: string; backgroundColor: string;
  characterSet: string;
};
export const DEFAULT_SETTINGS: AsciiSettings = {
  columns: 180, brightness: 1, contrast: 1, gamma: 1, opacity: 1,
  colorMode: 'color', foregroundColor: '#ffffff', backgroundColor: '#000000',
  characterSet: DEFAULT_CHARACTERS,
};
export const LIMITS = { columns: [20, 500], brightness: [0, 2], contrast: [0, 3], gamma: [0.2, 3], opacity: [0, 1] } as const;
export function normalizeSettings(value: AsciiSettings): AsciiSettings {
  const result = { ...value };
  for (const key of Object.keys(LIMITS) as (keyof typeof LIMITS)[]) {
    const [min, max] = LIMITS[key];
    result[key] = Math.max(min, Math.min(max, Number.isFinite(value[key]) ? value[key] : DEFAULT_SETTINGS[key]));
  }
  result.columns = Math.round(result.columns);
  // Extremely narrow fullscreen video can have a readable limit below the usual UI minimum.
  if (Number.isFinite(value.columns)) result.columns = Math.max(1, Math.min(500, Math.round(value.columns)));
  result.characterSet = normalizeCharacters(value.characterSet);
  result.colorMode = value.colorMode === 'monochrome' ? 'monochrome' : 'color';
  for (const key of ['foregroundColor', 'backgroundColor'] as const) {
    if (!/^#[0-9a-f]{6}$/i.test(value[key])) result[key] = DEFAULT_SETTINGS[key];
  }
  return result;
}
export function rgb(hex: string) {
  return [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255);
}
