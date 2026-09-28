const vertexSource = `#version 300 es
precision highp float;
out vec2 uv;
void main() {
  vec2 point = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  uv = point;
  gl_Position = vec4(point * 2.0 - 1.0, 0.0, 1.0);
}`;

const fragmentSource = `#version 300 es
precision highp float;
in vec2 uv;
uniform sampler2D videoTexture;
out vec4 color;
void main() {
  color = vec4(texture(videoTexture, uv).rgb, 1.0);
}`;

export function createVideoRenderer(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  onError: (message: string) => void,
  onReady: () => void,
) {
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: false });
  if (!gl) throw new Error('WebGL2 is unavailable. Enable hardware acceleration or try another browser.');

  let program: WebGLProgram | null = null;
  let texture: WebGLTexture | null = null;
  let vao: WebGLVertexArrayObject | null = null;
  let callbackId: number | null = null;
  let disposed = false;
  let lost = false;
  let failed = false;
  const useVideoCallback = typeof video.requestVideoFrameCallback === 'function';

  function release() {
    gl!.deleteTexture(texture);
    gl!.deleteVertexArray(vao);
    gl!.deleteProgram(program);
    texture = null;
    vao = null;
    program = null;
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

  function initialize() {
    const shaders: WebGLShader[] = [];
    try {
      shaders.push(compile(gl!.VERTEX_SHADER, vertexSource));
      shaders.push(compile(gl!.FRAGMENT_SHADER, fragmentSource));
      program = gl!.createProgram();
      if (!program) throw new Error('Unable to allocate a WebGL program.');
      shaders.forEach((shader) => gl!.attachShader(program!, shader));
      gl!.linkProgram(program);
      if (!gl!.getProgramParameter(program, gl!.LINK_STATUS)) {
        throw new Error(`WebGL program linking failed: ${gl!.getProgramInfoLog(program) ?? 'unknown error'}`);
      }
      texture = gl!.createTexture();
      vao = gl!.createVertexArray();
      if (!texture || !vao) throw new Error('Unable to allocate WebGL video resources.');
      gl!.useProgram(program);
      gl!.bindVertexArray(vao);
      gl!.activeTexture(gl!.TEXTURE0);
      gl!.bindTexture(gl!.TEXTURE_2D, texture);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.LINEAR);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, gl!.LINEAR);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE);
      gl!.pixelStorei(gl!.UNPACK_FLIP_Y_WEBGL, true);
      gl!.uniform1i(gl!.getUniformLocation(program, 'videoTexture'), 0);
      failed = false;
    } catch (error) {
      release();
      throw error;
    } finally {
      shaders.forEach((shader) => gl!.deleteShader(shader));
    }
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
      const maxTexture = gl!.getParameter(gl!.MAX_TEXTURE_SIZE) as number;
      if (video.videoWidth > maxTexture || video.videoHeight > maxTexture) {
        throw new Error('This video exceeds your GPU’s texture size limit. Choose a lower-resolution video.');
      }
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const maxSize = Math.min(gl!.getParameter(gl!.MAX_RENDERBUFFER_SIZE) as number, 4096);
      const scale = Math.min(dpr, maxSize / Math.max(rect.width, rect.height, 1));
      const width = Math.max(1, Math.round(rect.width * scale));
      const height = Math.max(1, Math.round(rect.height * scale));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      gl!.clearColor(0.03, 0.04, 0.035, 1);
      gl!.clear(gl!.COLOR_BUFFER_BIT);
      const fit = Math.min(width / video.videoWidth, height / video.videoHeight);
      const viewWidth = Math.max(1, Math.round(video.videoWidth * fit));
      const viewHeight = Math.max(1, Math.round(video.videoHeight * fit));
      gl!.viewport(Math.floor((width - viewWidth) / 2), Math.floor((height - viewHeight) / 2), viewWidth, viewHeight);
      gl!.useProgram(program);
      gl!.bindVertexArray(vao);
      gl!.bindTexture(gl!.TEXTURE_2D, texture);
      gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA, gl!.RGBA, gl!.UNSIGNED_BYTE, video);
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

  return () => {
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
}
