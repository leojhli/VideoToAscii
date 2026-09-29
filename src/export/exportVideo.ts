import { createVideoRenderer, type MatchingMode } from '../rendering/videoRenderer';
import { normalizeSettings, type AsciiSettings } from '../rendering/settings';

// Export uses its own decoder: preview playback and settings can remain independent.
export async function exportVideo(src: string, appearance: AsciiSettings, mode: MatchingMode,
  signal: AbortSignal, onProgress: (seconds: number, duration: number) => void): Promise<Blob> {
  if (typeof MediaRecorder === 'undefined' || !HTMLCanvasElement.prototype.captureStream)
    throw new Error('Video recording is unavailable in this browser. Try current Chrome or Edge.');
  const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/mp4'].find((type) => MediaRecorder.isTypeSupported(type));
  if (!mimeType) throw new Error('This browser has no supported video recording codec.');
  signal.throwIfAborted();
  const settings = normalizeSettings(appearance);
  const video = document.createElement('video');
  video.muted = true; video.playsInline = true; video.preload = 'auto'; video.crossOrigin = 'anonymous';
  let renderer: ReturnType<typeof createVideoRenderer> | undefined;
  let stream: MediaStream | undefined;
  let recorder: MediaRecorder | undefined;
  let fail: (error: Error) => void = () => {};
  let renderError: Error | undefined;
  const abort = () => fail(new DOMException('Export cancelled.', 'AbortError'));
  const hidden = () => { if (document.hidden) fail(new Error('Export stopped because the tab was hidden. Keep this tab visible and try again.')); };
  const mediaError = () => fail(new Error('The video could not be decoded for export. Try an MP4 or WebM file.'));
  let timer: number | undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      fail = reject;
      signal.addEventListener('abort', abort);
      document.addEventListener('visibilitychange', hidden);
      video.addEventListener('error', mediaError);
      video.onloadeddata = () => resolve();
      timer = window.setTimeout(() => reject(new Error('Loading the video for export timed out.')), 30000);
      video.src = src; video.load();
      hidden();
    });
    window.clearTimeout(timer);
    signal.throwIfAborted();
    // Rasterize glyphs at a useful output size even when the source is small.
    const scale = 1920 / Math.max(video.videoWidth, video.videoHeight);
    const width = Math.max(2, Math.round(video.videoWidth * scale / 2) * 2);
    const height = Math.max(2, Math.round(video.videoHeight * scale / 2) * 2);
    const gpu = document.createElement('canvas');
    const output = document.createElement('canvas');
    output.width = width; output.height = height;
    const context = output.getContext('2d');
    if (!context) throw new Error('Unable to allocate the export canvas.');
    renderer = createVideoRenderer(gpu, video, (message) => { renderError = new Error(message); fail(renderError); }, () => {}, undefined, {
      width, height, onFrame: () => {
        // CSS opacity is not captured by captureStream; bake it onto black instead.
        context.globalAlpha = 1; context.fillStyle = '#000'; context.fillRect(0, 0, width, height);
        context.globalAlpha = settings.opacity; context.drawImage(gpu, 0, 0);
      },
    });
    renderer.updateSettings(settings); renderer.setMode(mode);
    if (renderError) throw renderError;
    stream = output.captureStream(30);
    recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 12_000_000 });
    const activeRecorder = recorder;
    return await new Promise<Blob>((resolve, reject) => {
      fail = reject;
      const chunks: Blob[] = [];
      let bytes = 0;
      let lastTime = -1;
      let lastAdvance = performance.now();
      activeRecorder.ondataavailable = (event) => {
        bytes += event.data.size;
        if (bytes > 512 * 1024 * 1024) { reject(new Error('Export exceeded 512 MB. Try a shorter video.')); return; }
        if (event.data.size) chunks.push(event.data);
      };
      activeRecorder.onerror = () => reject(new Error('The browser could not encode the ASCII video.'));
      activeRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: activeRecorder.mimeType });
        if (blob.size) resolve(blob); else reject(new Error('The recorder produced an empty video.'));
      };
      video.onended = () => { if (activeRecorder.state !== 'inactive') activeRecorder.stop(); };
      timer = window.setInterval(() => {
        onProgress(video.currentTime, video.duration);
        if (video.currentTime !== lastTime) { lastTime = video.currentTime; lastAdvance = performance.now(); }
        if (performance.now() - lastAdvance > 30000) reject(new Error('Video playback stalled during export. Please retry.'));
      }, 250);
      activeRecorder.start(1000);
      // Paint again after capture starts so even very short clips contain a frame.
      video.dispatchEvent(new Event('seeked'));
      void video.play().catch(() => reject(new Error('Playback was blocked. Retry export from the button.')));
      hidden();
    });
  } finally {
    window.clearTimeout(timer); window.clearInterval(timer);
    signal.removeEventListener('abort', abort);
    document.removeEventListener('visibilitychange', hidden);
    video.removeEventListener('error', mediaError);
    video.onloadeddata = video.onended = null;
    if (recorder) {
      recorder.ondataavailable = recorder.onerror = recorder.onstop = null;
      if (recorder.state !== 'inactive') recorder.stop();
    }
    stream?.getTracks().forEach((track) => track.stop());
    renderer?.();
    video.pause(); video.removeAttribute('src'); video.load();
  }
}
