export const GLYPH_WIDTH = 12;
export const GLYPH_HEIGHT = 20;
export const DEFAULT_CHARACTERS = ' .,:;!iIl|/\\-_+~=()[]{}<>?tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$';

export function characterGrid(width: number, height: number, columns = 100) {
  const cols = Math.max(1, Math.min(200, Math.round(columns)));
  return { columns: cols, rows: Math.max(1, Math.min(400, Math.round(cols * height / width * GLYPH_WIDTH / GLYPH_HEIGHT))) };
}

// Six spatial averages, bottom row first to match WebGL texture coordinates.
export function glyphFeatures(pixels: Uint8ClampedArray, width: number, height: number) {
  const sums = new Array<number>(6).fill(0);
  const counts = new Array<number>(6).fill(0);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const block = Math.min(2, Math.floor((height - 1 - y) * 3 / height)) * 2 + Math.min(1, Math.floor(x * 2 / width));
      sums[block] += pixels[(y * width + x) * 4 + 3] / 255;
      counts[block]++;
    }
  }
  return sums.map((sum, i) => sum / Math.max(1, counts[i]));
}

export function normalizeShape(values: number[]) {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const deviation = Math.max(0.001, ...values.map((value) => Math.abs(value - mean)));
  return values.map((value) => (value - mean) / deviation);
}

export function createGlyphAtlas() {
  const tile = document.createElement('canvas');
  tile.width = GLYPH_WIDTH;
  tile.height = GLYPH_HEIGHT;
  const context = tile.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Unable to rasterize the ASCII font.');
  context.font = 'bold 18px monospace';
  context.textAlign = 'center';
  context.textBaseline = 'alphabetic';
  context.fillStyle = 'white';
  const glyphs = Array.from(DEFAULT_CHARACTERS).map((character) => {
    context.clearRect(0, 0, GLYPH_WIDTH, GLYPH_HEIGHT);
    context.fillText(character, GLYPH_WIDTH / 2, 15);
    const image = context.getImageData(0, 0, GLYPH_WIDTH, GLYPH_HEIGHT);
    const features = glyphFeatures(image.data, GLYPH_WIDTH, GLYPH_HEIGHT);
    return { character, image, features, density: features.reduce((a, b) => a + b, 0) / 6 };
  }).sort((a, b) => a.density - b.density);
  const canvas = document.createElement('canvas');
  canvas.width = GLYPH_WIDTH * glyphs.length;
  canvas.height = GLYPH_HEIGHT;
  const atlas = canvas.getContext('2d');
  if (!atlas) throw new Error('Unable to create the ASCII glyph atlas.');
  // Two RGBA float texels per glyph: six shape values, normalized ink density, padding.
  const descriptors = new Float32Array(glyphs.length * 8);
  const maxDensity = Math.max(...glyphs.map((glyph) => glyph.density), 0.001);
  glyphs.forEach((glyph, i) => {
    atlas.putImageData(glyph.image, i * GLYPH_WIDTH, 0);
    const shape = normalizeShape(glyph.features);
    descriptors.set(shape.slice(0, 4), i * 4);
    descriptors.set([shape[4], shape[5], glyph.density / maxDensity, 0], (glyphs.length + i) * 4);
  });
  return { canvas, descriptors, count: glyphs.length };
}
