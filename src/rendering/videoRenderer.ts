import { vertexSource, selectionSource, displaySource } from './asciiShaders';
import { readableGrid, createGlyphAtlas } from './glyphAtlas';
import { DEFAULT_SETTINGS, normalizeSettings, rgb } from './settings';
import type { AsciiSettings } from './settings';

export type MatchingMode = 'shape' | 'luminance';

export function createVideoRenderer(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  onError: (message: string) => void,
  onReady: () => void,
  onGrid: (grid: { columns: number; rows: number }) => void = () => {},
) {
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: false });
  if (!gl) throw new Error('WebGL2 is unavailable. Enable hardware acceleration or try another browser.');

  let program: WebGLProgram | null = null;
  let selectionProgram: WebGLProgram | null = null;
  let texture: WebGLTexture | null = null;
  let atlasTexture: WebGLTexture | null = null;
  let descriptorTexture: WebGLTexture | null = null;
  let cellTexture: WebGLTexture | null = null;
  let framebuffer: WebGLFramebuffer | null = null;
  let cellWidth = 0;
  let cellHeight = 0;
  let glyphCount = 0;
  let mode: MatchingMode = 'shape';
  let settings = { ...DEFAULT_SETTINGS };
  let maxTexture = 0;
  let maxSize = 0;
  let vao: WebGLVertexArrayObject | null = null;
  let callbackId: number | null = null;
  let disposed = false;
  let lost = false;
  let failed = false;
  const useVideoCallback = typeof video.requestVideoFrameCallback === 'function';

  function release() {
    gl!.deleteTexture(texture);
    gl!.deleteTexture(atlasTexture);
    gl!.deleteTexture(descriptorTexture);
    gl!.deleteTexture(cellTexture);
    gl!.deleteFramebuffer(framebuffer);
    gl!.deleteVertexArray(vao);
    gl!.deleteProgram(program);
    gl!.deleteProgram(selectionProgram);
    texture = null;
    vao = null;
    program = null;
    selectionProgram = null;
    atlasTexture = descriptorTexture = cellTexture = null;
    framebuffer = null;
    cellWidth = cellHeight = 0;
  }

  function compile(type: number, source: string) {
    const shader = gl!.createShader(type);
    if (!shader) throw new Error('Unable to allocate a WebGL shader.');
    gl!.shaderSource(shader, source);
    gl!.compileShader(shader);
    if (!gl!.getShaderParameter(shader, gl!.COMPILE_STATUS)) {
      const detail = gl!.getShaderInfoLog(shader);
      gl!.deleteShader(shader);
      throw new Error(`WebGL shader compilation failed: ${detail ?? 'unknown error'}`);
    }
    return shader;
  }

  function link(fragment: string) {
    const shaders: WebGLShader[] = [];
    let result: WebGLProgram | null = null;
    try {
      shaders.push(compile(gl!.VERTEX_SHADER, vertexSource));
      shaders.push(compile(gl!.FRAGMENT_SHADER, fragment));
      result = gl!.createProgram();
      if (!result) throw new Error('Unable to allocate a WebGL program.');
      shaders.forEach((shader) => gl!.attachShader(result!, shader));
      gl!.linkProgram(result);
      if (!gl!.getProgramParameter(result, gl!.LINK_STATUS)) {
        throw new Error(`WebGL program linking failed: ${gl!.getProgramInfoLog(result) ?? 'unknown error'}`);
      }
      return result;
    } catch (error) {
      gl!.deleteProgram(result);
      throw error;
    } finally {
      shaders.forEach((shader) => gl!.deleteShader(shader));
    }
  }

  function newTexture(unit: number, filter: number) {
    const result = gl!.createTexture();
    if (!result) throw new Error('Unable to allocate a WebGL texture.');
    gl!.activeTexture(gl!.TEXTURE0 + unit);
    gl!.bindTexture(gl!.TEXTURE_2D, result);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, filter);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, filter);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE);
    return result;
  }

  function initialize() {
    try {
      selectionProgram = link(selectionSource);
      program = link(displaySource);
      maxTexture = gl!.getParameter(gl!.MAX_TEXTURE_SIZE) as number;
      maxSize = Math.min(gl!.getParameter(gl!.MAX_RENDERBUFFER_SIZE) as number, 4096);
      texture = newTexture(0, gl!.LINEAR);
      atlasTexture = newTexture(1, gl!.LINEAR);
      descriptorTexture = newTexture(2, gl!.NEAREST);
      uploadAtlas();
      cellTexture = newTexture(3, gl!.NEAREST);
      framebuffer = gl!.createFramebuffer();
      vao = gl!.createVertexArray();
      if (!framebuffer || !vao) throw new Error('Unable to allocate WebGL ASCII resources.');
      gl!.disable(gl!.DITHER);
      gl!.useProgram(selectionProgram);
      gl!.uniform1i(gl!.getUniformLocation(selectionProgram, 'videoTexture'), 0);
      gl!.uniform1i(gl!.getUniformLocation(selectionProgram, 'descriptors'), 2);
      gl!.uniform1i(gl!.getUniformLocation(selectionProgram, 'glyphCount'), glyphCount);
      gl!.useProgram(program);
      gl!.uniform1i(gl!.getUniformLocation(program, 'atlas'), 1);
      gl!.uniform1i(gl!.getUniformLocation(program, 'cells'), 3);
      gl!.uniform1i(gl!.getUniformLocation(program, 'glyphCount'), glyphCount);
      failed = false;
    } catch (error) {
      release();
      throw error;
    }
  }

  function uploadAtlas() {
    const atlas = createGlyphAtlas(settings.characterSet);
    glyphCount = atlas.count;
    gl!.activeTexture(gl!.TEXTURE0 + 1);
    gl!.bindTexture(gl!.TEXTURE_2D, atlasTexture);
    gl!.pixelStorei(gl!.UNPACK_FLIP_Y_WEBGL, true);
    gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA, gl!.RGBA, gl!.UNSIGNED_BYTE, atlas.canvas);
    gl!.activeTexture(gl!.TEXTURE0 + 2);
    gl!.bindTexture(gl!.TEXTURE_2D, descriptorTexture);
    gl!.pixelStorei(gl!.UNPACK_FLIP_Y_WEBGL, false);
    gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA32F, glyphCount, 2, 0, gl!.RGBA, gl!.FLOAT, atlas.descriptors);
  }

  function cancel() {
    if (callbackId === null) return;
    if (useVideoCallback) video.cancelVideoFrameCallback(callbackId);
    else cancelAnimationFrame(callbackId);
    callbackId = null;
  }

  function report(error: unknown) {
    failed = true;
    cancel();
    onError(error instanceof Error ? error.message : 'Unable to render this video with WebGL2.');
  }

  function draw() {
    if (disposed || lost || failed || document.hidden || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return;
    try {
      if (video.videoWidth > maxTexture || video.videoHeight > maxTexture) {
        throw new Error('This video exceeds your GPU’s texture size limit. Choose a lower-resolution video.');
      }
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const scale = Math.min(dpr, maxSize / Math.max(rect.width, rect.height, 1));
      const width = Math.max(1, Math.round(rect.width * scale));
      const height = Math.max(1, Math.round(rect.height * scale));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      const fit = Math.min(width / video.videoWidth, height / video.videoHeight);
      const viewWidth = Math.max(1, Math.round(video.videoWidth * fit));
      const viewHeight = Math.max(1, Math.round(video.videoHeight * fit));
      const grid = readableGrid(video.videoWidth, video.videoHeight, settings.columns, rect.width, rect.height);
      canvas.dataset.grid = `${grid.columns} × ${grid.rows}`;
      gl!.bindVertexArray(vao);
      gl!.activeTexture(gl!.TEXTURE0);
      gl!.bindTexture(gl!.TEXTURE_2D, texture);
      gl!.pixelStorei(gl!.UNPACK_FLIP_Y_WEBGL, true);
      gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA, gl!.RGBA, gl!.UNSIGNED_BYTE, video);
      gl!.bindFramebuffer(gl!.FRAMEBUFFER, framebuffer);
      if (cellWidth !== grid.columns || cellHeight !== grid.rows) {
        onGrid(grid);
        cellWidth = grid.columns;
        cellHeight = grid.rows;
        gl!.activeTexture(gl!.TEXTURE0 + 3);
        gl!.bindTexture(gl!.TEXTURE_2D, cellTexture);
        gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA8, cellWidth, cellHeight, 0, gl!.RGBA, gl!.UNSIGNED_BYTE, null);
        gl!.framebufferTexture2D(gl!.FRAMEBUFFER, gl!.COLOR_ATTACHMENT0, gl!.TEXTURE_2D, cellTexture, 0);
        if (gl!.checkFramebufferStatus(gl!.FRAMEBUFFER) !== gl!.FRAMEBUFFER_COMPLETE) throw new Error('Unable to create the ASCII cell framebuffer.');
      }
      gl!.viewport(0, 0, cellWidth, cellHeight);
      gl!.useProgram(selectionProgram);
      gl!.uniform2f(gl!.getUniformLocation(selectionProgram!, 'grid'), cellWidth, cellHeight);
      gl!.uniform1i(gl!.getUniformLocation(selectionProgram!, 'shapeMode'), mode === 'shape' ? 1 : 0);
      gl!.uniform1i(gl!.getUniformLocation(selectionProgram!, 'glyphCount'), glyphCount);
      for (const name of ['brightness', 'contrast', 'gamma'] as const) gl!.uniform1f(gl!.getUniformLocation(selectionProgram!, name), settings[name]);
      gl!.drawArrays(gl!.TRIANGLES, 0, 3);

      gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
      const [r, g, b] = rgb(settings.backgroundColor);
      gl!.clearColor(r, g, b, 1);
      gl!.clear(gl!.COLOR_BUFFER_BIT);
      gl!.viewport(Math.floor((width - viewWidth) / 2), Math.floor((height - viewHeight) / 2), viewWidth, viewHeight);
      gl!.useProgram(program);
      gl!.uniform2f(gl!.getUniformLocation(program!, 'grid'), cellWidth, cellHeight);
      gl!.uniform1i(gl!.getUniformLocation(program!, 'glyphCount'), glyphCount);
      gl!.uniform1i(gl!.getUniformLocation(program!, 'monochrome'), settings.colorMode === 'monochrome' ? 1 : 0);
      gl!.uniform3fv(gl!.getUniformLocation(program!, 'foreground'), rgb(settings.foregroundColor));
      gl!.uniform3fv(gl!.getUniformLocation(program!, 'background'), rgb(settings.backgroundColor));
      gl!.drawArrays(gl!.TRIANGLES, 0, 3);
    } catch (error) {
      report(error);
    }
  }

  function schedule() {
    if (disposed || lost || failed || document.hidden || video.paused || video.ended || callbackId !== null) return;
    callbackId = useVideoCallback ? video.requestVideoFrameCallback(tick) : requestAnimationFrame(tick);
  }

  function tick() {
    callbackId = null;
    draw();
    schedule();
  }

  function refresh() { draw(); schedule(); }
  function stop() { cancel(); draw(); }
  function visibility() { if (document.hidden) cancel(); else refresh(); }
  function contextLost(event: Event) {
    event.preventDefault();
    lost = true;
    cancel();
    onError('The GPU context was lost. Waiting for the browser to restore it…');
  }
  function contextRestored() {
    if (disposed) return;
    lost = false;
    try {
      release();
      initialize();
      onReady();
      refresh();
    } catch (error) { report(error); }
  }

  initialize();
  const observer = new ResizeObserver(refresh);
  observer.observe(canvas);
  const refreshEvents = ['loadeddata', 'seeked', 'playing', 'resize'] as const;
  const stopEvents = ['pause', 'ended'] as const;
  refreshEvents.forEach((event) => video.addEventListener(event, refresh));
  stopEvents.forEach((event) => video.addEventListener(event, stop));
  video.addEventListener('error', cancel);
  document.addEventListener('visibilitychange', visibility);
  canvas.addEventListener('webglcontextlost', contextLost);
  canvas.addEventListener('webglcontextrestored', contextRestored);
  onReady();
  refresh();

  const dispose = () => {
    disposed = true;
    cancel();
    observer.disconnect();
    refreshEvents.forEach((event) => video.removeEventListener(event, refresh));
    stopEvents.forEach((event) => video.removeEventListener(event, stop));
    video.removeEventListener('error', cancel);
    document.removeEventListener('visibilitychange', visibility);
    canvas.removeEventListener('webglcontextlost', contextLost);
    canvas.removeEventListener('webglcontextrestored', contextRestored);
    release();
  };
  return Object.assign(dispose, {
    setMode(next: MatchingMode) { mode = next; draw(); },
    updateSettings(next: AsciiSettings) {
      if (disposed) return;
      const normalized = normalizeSettings(next);
      const changed = normalized.characterSet !== settings.characterSet;
      settings = normalized;
      canvas.style.opacity = String(settings.opacity);
      if (changed && !lost && !failed) {
        try { uploadAtlas(); } catch (error) { report(error); }
      }
      draw();
    },
  });
}
