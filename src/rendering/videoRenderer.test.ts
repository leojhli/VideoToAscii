import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createVideoRenderer } from './videoRenderer';

function mockGL() {
  const gl: Record<string, unknown> = {};
  const constants = ['VERTEX_SHADER', 'FRAGMENT_SHADER', 'COMPILE_STATUS', 'LINK_STATUS', 'TEXTURE0', 'TEXTURE_2D', 'TEXTURE_MIN_FILTER', 'TEXTURE_MAG_FILTER', 'LINEAR', 'TEXTURE_WRAP_S', 'TEXTURE_WRAP_T', 'CLAMP_TO_EDGE', 'UNPACK_FLIP_Y_WEBGL', 'MAX_TEXTURE_SIZE', 'MAX_RENDERBUFFER_SIZE', 'COLOR_BUFFER_BIT', 'RGBA', 'UNSIGNED_BYTE', 'TRIANGLES'];
  constants.forEach((name, i) => { gl[name] = i + 1; });
  for (const name of ['createShader', 'createProgram', 'createTexture', 'createVertexArray', 'getUniformLocation']) gl[name] = vi.fn(() => ({}));
  for (const name of ['deleteShader', 'deleteProgram', 'deleteTexture', 'deleteVertexArray', 'shaderSource', 'compileShader', 'attachShader', 'linkProgram', 'useProgram', 'bindVertexArray', 'activeTexture', 'bindTexture', 'texParameteri', 'pixelStorei', 'uniform1i', 'clearColor', 'clear', 'viewport', 'texImage2D', 'drawArrays']) gl[name] = vi.fn();
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
  it('uploads frames, fits the aspect ratio, and releases resources and callbacks', () => {
    dispose = createVideoRenderer(canvas, video, vi.fn(), vi.fn());
    expect(gl.viewport).toHaveBeenCalledWith(0, 75, 800, 450);
    expect(gl.texImage2D).toHaveBeenCalledWith(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
    expect(gl.pixelStorei).toHaveBeenCalledWith(gl.UNPACK_FLIP_Y_WEBGL, true);
    frame(0, {} as VideoFrameCallbackMetadata);
    expect(gl.drawArrays).toHaveBeenCalledTimes(2);
    dispose(); dispose = undefined;
    expect(video.cancelVideoFrameCallback).toHaveBeenCalledWith(42);
    expect(gl.deleteTexture).toHaveBeenCalledTimes(1);
    expect(gl.deleteProgram).toHaveBeenCalledTimes(1);
    expect(gl.deleteVertexArray).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalledOnce();
    video.dispatchEvent(new Event('seeked'));
    expect(gl.drawArrays).toHaveBeenCalledTimes(2);
  });

  it('stops at pause, redraws seeks, and restarts on playback', () => {
    dispose = createVideoRenderer(canvas, video, vi.fn(), vi.fn());
    Object.defineProperty(video, 'paused', { value: true, configurable: true });
    video.dispatchEvent(new Event('pause'));
    expect(video.cancelVideoFrameCallback).toHaveBeenCalledWith(42);
    video.dispatchEvent(new Event('seeked'));
    expect(video.requestVideoFrameCallback).toHaveBeenCalledTimes(1);
    expect(gl.drawArrays).toHaveBeenCalledTimes(3);
    Object.defineProperty(video, 'paused', { value: false, configurable: true });
    video.dispatchEvent(new Event('playing'));
    expect(video.requestVideoFrameCallback).toHaveBeenCalledTimes(2);
  });

  it('suspends rendering in a hidden tab and resumes when visible', () => {
    dispose = createVideoRenderer(canvas, video, vi.fn(), vi.fn());
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    video.dispatchEvent(new Event('seeked'));
    expect(gl.drawArrays).toHaveBeenCalledTimes(1);
    expect(video.cancelVideoFrameCallback).toHaveBeenCalled();
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(gl.drawArrays).toHaveBeenCalledTimes(2);
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
    expect(gl.createProgram).toHaveBeenCalledTimes(2);
    expect(ready).toHaveBeenCalledTimes(2);
    expect(gl.drawArrays).toHaveBeenCalledTimes(2);
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
    expect(gl.texImage2D).not.toHaveBeenCalled();
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
});
