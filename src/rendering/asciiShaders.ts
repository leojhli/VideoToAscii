export const vertexSource = `#version 300 es
precision highp float;
out vec2 uv;
void main() {
  vec2 point = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  uv = point;
  gl_Position = vec4(point * 2.0 - 1.0, 0.0, 1.0);
}`;

// Runs once per character cell, not once per output pixel.
export const selectionSource = `#version 300 es
precision highp float;
in vec2 uv;
uniform sampler2D videoTexture;
uniform sampler2D descriptors;
uniform vec2 grid;
uniform int glyphCount;
uniform int shapeMode;
uniform float brightness;
uniform float contrast;
uniform float gamma;
out vec4 color;
void main() {
  vec2 cell = floor(gl_FragCoord.xy);
  float samples[6];
  vec3 average = vec3(0.0);
  float mean = 0.0;
  for (int y = 0; y < 3; y++) {
    for (int x = 0; x < 2; x++) {
      vec3 block = vec3(0.0);
      for (int sy = 0; sy < 2; sy++) {
        for (int sx = 0; sx < 2; sx++) {
          vec2 offset = (vec2(float(x), float(y)) + (vec2(float(sx), float(sy)) + 0.5) / 2.0) / vec2(2.0, 3.0);
          block += texture(videoTexture, (cell + offset) / grid).rgb * 0.25;
        }
      }
      block = pow(clamp((block * brightness - 0.5) * contrast + 0.5, 0.0, 1.0), vec3(1.0 / gamma));
      float light = dot(block, vec3(0.2126, 0.7152, 0.0722));
      samples[y * 2 + x] = light;
      mean += light / 6.0;
      average += block / 6.0;
    }
  }
  float deviation = 0.001;
  for (int i = 0; i < 6; i++) deviation = max(deviation, abs(samples[i] - mean));
  for (int i = 0; i < 6; i++) samples[i] = (samples[i] - mean) / deviation;
  int best = 0;
  float bestScore = 10000.0;
  for (int i = 0; i < 128; i++) {
    if (i >= glyphCount) break;
    vec4 a = texelFetch(descriptors, ivec2(i, 0), 0);
    vec4 b = texelFetch(descriptors, ivec2(i, 1), 0);
    float densityError = b.z - mean;
    float score = 2.0 * densityError * densityError;
    if (shapeMode == 1) {
      vec4 diffA = a - vec4(samples[0], samples[1], samples[2], samples[3]);
      vec2 diffB = b.xy - vec2(samples[4], samples[5]);
      float shapeError = (dot(diffA, diffA) + dot(diffB, diffB)) / 6.0;
      score += 0.18 * smoothstep(0.02, 0.18, deviation) * shapeError;
    }
    if (score < bestScore) { bestScore = score; best = i; }
  }
  color = vec4(float(best) / 255.0, average);
}`;

export const displaySource = `#version 300 es
precision highp float;
in vec2 uv;
uniform sampler2D cells;
uniform sampler2D atlas;
uniform int monochrome;
uniform vec3 foreground;
uniform vec3 background;
uniform vec2 grid;
uniform int glyphCount;
out vec4 color;
void main() {
  vec2 position = min(uv * grid, grid - 0.0001);
  vec4 cell = texelFetch(cells, ivec2(floor(position)), 0);
  float index = floor(cell.r * 255.0 + 0.5);
  vec2 local = fract(position);
  // Half-texel clamping prevents adjacent glyphs bleeding into the current tile.
  vec2 inset = 0.5 / vec2(12.0, 20.0);
  local = clamp(local, inset, 1.0 - inset);
  float ink = texture(atlas, vec2((index + local.x) / float(glyphCount), local.y)).a;
  color = vec4(mix(background, monochrome == 1 ? foreground : cell.gba, ink), 1.0);
}`;
