import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createVideoRenderer } from './videoRenderer';
import { DEFAULT_SETTINGS } from './settings';

vi.mock('./glyphAtlas', async (original) => ({
  ...await original<typeof import('./glyphAtlas')>(),
  createGlyphAtlas: () => ({ canvas: document.createElement('canvas'), count: 2, descriptors: new Float32Array(16) }),
}));

function mockGL() {
  const gl: Record<string, unknown> = {};
  const constants = ['VERTEX_SHADER', 'FRAGMENT_SHADER', 'COMPILE_STATUS', 'LINK_STATUS', 'TEXTURE0', 'TEXTURE_2D', 'TEXTURE_MIN_FILTER', 'TEXTURE_MAG_FILTER', 'LINEAR', 'TEXTURE_WRAP_S', 'TEXTURE_WRAP_T', 'CLAMP_TO_EDGE', 'UNPACK_FLIP_Y_WEBGL', 'MAX_TEXTURE_SIZE', 'MAX_RENDERBUFFER_SIZE', 'COLOR_BUFFER_BIT', 'RGBA', 'UNSIGNED_BYTE', 'TRIANGLES', 'NEAREST', 'RGBA32F', 'FLOAT', 'FRAMEBUFFER', 'FRAMEBUFFER_COMPLETE', 'COLOR_ATTACHMENT0', 'RGBA8', 'DITHER'];
  constants.forEach((name, i) => { gl[name] = i + 1; });
  for (const name of ['createShader', 'createProgram', 'createTexture', 'createVertexArray', 'createFramebuffer', 'getUniformLocation']) gl[name] = vi.fn(() => ({}));
  for (const name of ['deleteShader', 'deleteProgram', 'deleteTexture', 'deleteVertexArray', 'shaderSource', 'compileShader', 'attachShader', 'linkProgram', 'useProgram', 'bindVertexArray', 'activeTexture', 'bindTexture', 'texParameteri', 'pixelStorei', 'uniform1i', 'clearColor', 'clear', 'viewport', 'texImage2D', 'drawArrays', 'uniform2f', 'deleteFramebuffer', 'bindFramebuffer', 'framebufferTexture2D', 'disable']) gl[name] = vi.fn();
  gl.checkFramebufferStatus = vi.fn(() => gl.FRAMEBUFFER_COMPLETE);
  gl.uniform1f = vi.fn();
  gl.texSubImage2D = vi.fn();
  gl.uniform3fv = vi.fn();
  gl.getShaderParameter = vi.fn(() => true);
  gl.getProgramParameter = vi.fn(() => true);
  gl.getShaderInfoLog = vi.fn(() => 'compile error');
  gl.getProgramInfoLog = vi.fn(() => 'link error');
  gl.getParameter = vi.fn(() => 4096);
  return gl as unknown as WebGL2RenderingContext;
}

let gl: WebGL2RenderingContext;
let canvas: HTMLCanvasElement;
let video: HTMLVideoElement;
let disconnect: ReturnType<typeof vi.fn>;
let frame: VideoFrameRequestCallback;
let dispose: (() => void) | undefined;

beforeEach(() => {
  gl = mockGL();
  canvas = document.createElement('canvas');
  video = document.createElement('video');
  vi.spyOn(canvas, 'getContext').mockReturnValue(gl);
  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ width: 800, height: 600 } as DOMRect);
  Object.defineProperties(video, {
    videoWidth: { value: 1920, configurable: true }, videoHeight: { value: 1080 },
    readyState: { value: 2 }, paused: { value: false, configurable: true },
  });
  Object.defineProperty(document, 'hidden', { value: false, configurable: true });
  vi.stubGlobal('devicePixelRatio', 1);
  video.requestVideoFrameCallback = vi.fn((callback) => { frame = callback; return 42; });
  video.cancelVideoFrameCallback = vi.fn();
  disconnect = vi.fn();
  vi.stubGlobal('ResizeObserver', class { observe = vi.fn(); disconnect = disconnect; });
});

afterEach(() => { dispose?.(); dispose = undefined; vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('WebGL video renderer', () => {
  it('draws detached export targets at fixed dimensions and calls the capture hook', () => {
    vi.mocked(canvas.getBoundingClientRect).mockReturnValue({ width: 0, height: 0 } as DOMRect);
    const capture = vi.fn();
    const grid = vi.fn();
    dispose = createVideoRenderer(canvas, video, vi.fn(), vi.fn(), grid, { width: 1920, height: 1080, onFrame: capture });
    expect(canvas.width).toBe(1920);
    expect(canvas.height).toBe(1080);
    expect(grid).toHaveBeenLastCalledWith({ columns: 180, rows: 61 });
    expect(capture).toHaveBeenCalledOnce();
    dispose();
    video.dispatchEvent(new Event('seeked'));
    expect(capture).toHaveBeenCalledOnce();
  });
  it('caps drawing-buffer dimensions and device-pixel ratio', () => {
    vi.stubGlobal('devicePixelRatio', 4);
    dispose = createVideoRenderer(canvas, video, vi.fn(), vi.fn());
    expect(canvas.width).toBe(1600);
    expect(canvas.height).toBe(1200);
    vi.mocked(canvas.getBoundingClientRect).mockReturnValue({ width: 6000, height: 4000 } as DOMRect);
    video.dispatchEvent(new Event('resize'));
    expect(canvas.width).toBe(4096);
    expect(canvas.height).toBeLessThanOrEqual(4096);
  });

  it('skips unchanged video frames in the animation-frame fallback', () => {
    Object.defineProperty(video, 'requestVideoFrameCallback', { value: undefined });
    let callback: FrameRequestCallback = () => {};
    vi.stubGlobal('requestAnimationFrame', vi.fn((next) => { callback = next; return 9; }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    dispose = createVideoRenderer(canvas, video, vi.fn(), vi.fn());
    callback(0);
    callback(34);
    expect(gl.drawArrays).toHaveBeenCalledTimes(2);
    video.currentTime = 1;
    callback(68);
    expect(gl.drawArrays).toHaveBeenCalledTimes(4);
    expect(gl.texSubImage2D).toHaveBeenCalledOnce();
  });
  it('stops offscreen rendering and disconnects its intersection observer', () => {
    let notify: (entries: { isIntersecting: boolean }[]) => void = () => {};
    const disconnectIntersection = vi.fn();
    vi.stubGlobal('IntersectionObserver', class {
      constructor(callback: typeof notify) { notify = callback; }
      observe = vi.fn(); disconnect = disconnectIntersection;
    });
    dispose = createVideoRenderer(canvas, video, vi.fn(), vi.fn());
    notify([{ isIntersecting: false }]);
    video.dispatchEvent(new Event('seeked'));
    expect(gl.drawArrays).toHaveBeenCalledTimes(2);
    expect(video.cancelVideoFrameCallback).toHaveBeenCalled();
    notify([{ isIntersecting: true }]);
    expect(gl.drawArrays).toHaveBeenCalledTimes(4);
    dispose(); dispose = undefined;
    expect(disconnectIntersection).toHaveBeenCalledOnce();
  });

  it('reuses paused textures and uniform locations, then updates changed frames in place', () => {
    dispose = createVideoRenderer(canvas, video, vi.fn(), vi.fn());
    const lookupCount = vi.mocked(gl.getUniformLocation).mock.calls.length;
    const allocations = vi.mocked(gl.texImage2D).mock.calls.length;
    video.dispatchEvent(new Event('seeked'));
    expect(gl.getUniformLocation).toHaveBeenCalledTimes(lookupCount);
    expect(gl.texImage2D).toHaveBeenCalledTimes(allocations);
    expect(gl.texSubImage2D).not.toHaveBeenCalled();
    video.currentTime = 1;
    video.dispatchEvent(new Event('seeked'));
    expect(gl.texSubImage2D).toHaveBeenCalledOnce();
    expect(gl.texImage2D).toHaveBeenCalledTimes(allocations);
  });

  it('caps callback-driven playback at 30fps but redraws explicit seek events', () => {
    dispose = createVideoRenderer(canvas, video, vi.fn(), vi.fn());
    frame(0, {} as VideoFrameCallbackMetadata);
    frame(10, {} as VideoFrameCallbackMetadata);
    frame(20, {} as VideoFrameCallbackMetadata);
    expect(gl.drawArrays).toHaveBeenCalledTimes(4);
    frame(34, {} as VideoFrameCallbackMetadata);
    expect(gl.drawArrays).toHaveBeenCalledTimes(6);
    video.dispatchEvent(new Event('seeked'));
    expect(gl.drawArrays).toHaveBeenCalledTimes(8);
  });

  it('does not render or schedule when the canvas has no area', () => {
    vi.mocked(canvas.getBoundingClientRect).mockReturnValue({ width: 0, height: 0 } as DOMRect);
    dispose = createVideoRenderer(canvas, video, vi.fn(), vi.fn());
    expect(gl.drawArrays).not.toHaveBeenCalled();
    expect(video.requestVideoFrameCallback).not.toHaveBeenCalled();
    vi.mocked(canvas.getBoundingClientRect).mockReturnValue({ width: 800, height: 600 } as DOMRect);
    video.dispatchEvent(new Event('resize'));
    expect(gl.drawArrays).toHaveBeenCalledTimes(2);
    expect(video.requestVideoFrameCallback).toHaveBeenCalled();
  });
  it('preserves selected density without reloading programs', () => {
    Object.defineProperty(video, 'paused', { value: true });
    const renderer = createVideoRenderer(canvas, video, vi.fn(), vi.fn());
    dispose = renderer;
    renderer.updateSettings({ ...DEFAULT_SETTINGS, columns: 500, gamma: 2, opacity: .5 });
    expect(canvas.dataset.grid).toBe('500 × 169');
    expect(canvas.style.opacity).toBe('0.5');
    expect(gl.createProgram).toHaveBeenCalledTimes(2);
    expect(gl.drawArrays).toHaveBeenCalledTimes(4);
    expect(video.requestVideoFrameCallback).not.toHaveBeenCalled();
  });
  it('uploads frames, fits the aspect ratio, and releases resources and callbacks', () => {
    dispose = createVideoRenderer(canvas, video, vi.fn(), vi.fn());
    expect(gl.viewport).toHaveBeenCalledWith(0, 75, 800, 450);
    expect(gl.texImage2D).toHaveBeenCalledWith(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
    expect(gl.pixelStorei).toHaveBeenCalledWith(gl.UNPACK_FLIP_Y_WEBGL, true);
    frame(0, {} as VideoFrameCallbackMetadata);
    expect(gl.drawArrays).toHaveBeenCalledTimes(4);
    dispose(); dispose = undefined;
    expect(video.cancelVideoFrameCallback).toHaveBeenCalledWith(42);
    expect(gl.deleteTexture).toHaveBeenCalledTimes(4);
    expect(gl.deleteProgram).toHaveBeenCalledTimes(2);
    expect(gl.deleteFramebuffer).toHaveBeenCalledTimes(1);
    expect(gl.deleteVertexArray).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalledOnce();
    video.dispatchEvent(new Event('seeked'));
    expect(gl.drawArrays).toHaveBeenCalledTimes(4);
  });

  it('stops at pause, redraws seeks, and restarts on playback', () => {
    dispose = createVideoRenderer(canvas, video, vi.fn(), vi.fn());
    Object.defineProperty(video, 'paused', { value: true, configurable: true });
    video.dispatchEvent(new Event('pause'));
    expect(video.cancelVideoFrameCallback).toHaveBeenCalledWith(42);
    video.dispatchEvent(new Event('seeked'));
    expect(video.requestVideoFrameCallback).toHaveBeenCalledTimes(1);
    expect(gl.drawArrays).toHaveBeenCalledTimes(6);
    Object.defineProperty(video, 'paused', { value: false, configurable: true });
    video.dispatchEvent(new Event('playing'));
    expect(video.requestVideoFrameCallback).toHaveBeenCalledTimes(2);
  });

  it('suspends rendering in a hidden tab and resumes when visible', () => {
    dispose = createVideoRenderer(canvas, video, vi.fn(), vi.fn());
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    video.dispatchEvent(new Event('seeked'));
    expect(gl.drawArrays).toHaveBeenCalledTimes(2);
    expect(video.cancelVideoFrameCallback).toHaveBeenCalled();
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(gl.drawArrays).toHaveBeenCalledTimes(4);
  });

  it('rebuilds resources after context restoration', () => {
    const error = vi.fn();
    const ready = vi.fn();
    dispose = createVideoRenderer(canvas, video, error, ready);
    const loss = new Event('webglcontextlost', { cancelable: true });
    canvas.dispatchEvent(loss);
    expect(loss.defaultPrevented).toBe(true);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('context was lost'));
    canvas.dispatchEvent(new Event('webglcontextrestored'));
    expect(gl.createProgram).toHaveBeenCalledTimes(4);
    expect(ready).toHaveBeenCalledTimes(2);
    expect(gl.drawArrays).toHaveBeenCalledTimes(4);
  });

  it('rejects unavailable WebGL2 and cleans up partial shader failures', () => {
    vi.mocked(canvas.getContext).mockReturnValueOnce(null);
    expect(() => createVideoRenderer(canvas, video, vi.fn(), vi.fn())).toThrow('WebGL2 is unavailable');
    vi.mocked(gl.getShaderParameter).mockReturnValueOnce(true).mockReturnValueOnce(false);
    expect(() => createVideoRenderer(canvas, video, vi.fn(), vi.fn())).toThrow('compilation failed');
    expect(gl.deleteShader).toHaveBeenCalledTimes(2);
  });

  it('reports oversized videos without uploading them', () => {
    Object.defineProperty(video, 'videoWidth', { value: 8000 });
    const error = vi.fn();
    dispose = createVideoRenderer(canvas, video, error, vi.fn());
    expect(error).toHaveBeenCalledWith(expect.stringContaining('texture size limit'));
    expect(gl.texImage2D).not.toHaveBeenCalledWith(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
    expect(video.requestVideoFrameCallback).not.toHaveBeenCalled();
  });

  it('uses and cancels the animation-frame fallback', () => {
    Object.defineProperty(video, 'requestVideoFrameCallback', { value: undefined });
    const request = vi.fn(() => 9);
    const cancel = vi.fn();
    vi.stubGlobal('requestAnimationFrame', request);
    vi.stubGlobal('cancelAnimationFrame', cancel);
    dispose = createVideoRenderer(canvas, video, vi.fn(), vi.fn());
    expect(request).toHaveBeenCalledOnce();
    dispose(); dispose = undefined;
    expect(cancel).toHaveBeenCalledWith(9);
  });

  it('redraws mode changes while paused without re-creating resources', () => {
    Object.defineProperty(video, 'paused', { value: true });
    const renderer = createVideoRenderer(canvas, video, vi.fn(), vi.fn());
    dispose = renderer;
    renderer.setMode('luminance');
    expect(gl.drawArrays).toHaveBeenCalledTimes(4);
    expect(gl.createProgram).toHaveBeenCalledTimes(2);
    expect(video.requestVideoFrameCallback).not.toHaveBeenCalled();
  });

  it('reports an incomplete cell framebuffer and releases resources', () => {
    vi.mocked(gl.checkFramebufferStatus).mockReturnValue(0);
    const error = vi.fn();
    dispose = createVideoRenderer(canvas, video, error, vi.fn());
    expect(error).toHaveBeenCalledWith(expect.stringContaining('cell framebuffer'));
    expect(gl.drawArrays).not.toHaveBeenCalled();
  });
});
