import { useEffect, useRef, useState } from 'react';
import { createVideoRenderer } from '../rendering/videoRenderer';
import type { MatchingMode } from '../rendering/videoRenderer';

type VideoPreviewProps = { file: File };
type Metadata = { width: number; height: number; duration: number };

export function VideoPreview({ file }: VideoPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<ReturnType<typeof createVideoRenderer> | null>(null);
  const [matchingMode, setMatchingMode] = useState<MatchingMode>('shape');
  const [metadata, setMetadata] = useState<Metadata | null>(null);
  const [error, setError] = useState('');
  const [renderError, setRenderError] = useState('');
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // A blob URL lets the browser read this File without uploading or copying it into React state.
    const objectUrl = URL.createObjectURL(file);
    video.src = objectUrl;
    let disposeRenderer: ReturnType<typeof createVideoRenderer> | undefined;
    try {
      if (canvasRef.current) {
        disposeRenderer = createVideoRenderer(canvasRef.current, video, setRenderError, () => setRenderError(''));
        rendererRef.current = disposeRenderer;
      }
    } catch (cause) {
      setRenderError(cause instanceof Error ? cause.message : 'Unable to start WebGL2.');
    }

    return () => {
      disposeRenderer?.();
      rendererRef.current = null;
      // Release the media element first, then release the URL's reference to the file.
      video.pause();
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(objectUrl);
    };
  }, [file]);

  function readMetadata() {
    const video = videoRef.current;
    if (!video) return;
    setMetadata({ width: video.videoWidth, height: video.videoHeight, duration: video.duration });
  }

  async function togglePlayback() {
    const video = videoRef.current;
    if (!video) return;
    if (!video.paused) { video.pause(); return; }
    try {
      if (video.ended) video.currentTime = 0;
      await video.play();
    } catch {
      setError('Playback could not start. Try selecting the video again.');
    }
  }

  return (
    <div className="video-preview">
      <video
        ref={videoRef}
        hidden
        muted
        playsInline
        preload="metadata"
        aria-label={`Preview of ${file.name}`}
        onLoadedMetadata={readMetadata}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime ?? 0)}
        onError={() => setError('This browser could not play the file. Try another MP4 or WebM video.')}
      />
      <canvas ref={canvasRef} className="gpu-preview" role="img" aria-label={`WebGL preview of ${file.name}`} />
      <div className="matching-control">
        <label htmlFor="matching-mode">Character matching</label>
        <select id="matching-mode" value={matchingMode} onChange={(event) => {
          const mode = event.currentTarget.value as MatchingMode;
          setMatchingMode(mode);
          rendererRef.current?.setMode(mode);
        }}>
          <option value="shape">Shape + brightness</option>
          <option value="luminance">Brightness only</option>
        </select>
      </div>
      {renderError && <p role="alert" className="render-error error">{renderError}</p>}
      <div className="playback-controls">
        <button className="text-button" disabled={!metadata || !!error || !!renderError} onClick={togglePlayback}>{playing ? 'Pause' : 'Play'}</button>
        <label htmlFor="video-seek">Seek</label>
        <input id="video-seek" type="range" min="0" max={Number.isFinite(metadata?.duration) ? metadata!.duration : 0} step="0.01" value={currentTime}
          disabled={!metadata || !Number.isFinite(metadata.duration) || !!error || !!renderError}
          onChange={(event) => { const time = Number(event.currentTarget.value); if (videoRef.current) videoRef.current.currentTime = time; setCurrentTime(time); }} />
        <span>{currentTime.toFixed(1)}s</span>
      </div>
      <div className="preview-status" role="status">
        {error ? <span className="error">{error}</span> : metadata ? (
          <span>{metadata.width} × {metadata.height} px · {Number.isFinite(metadata.duration) ? `${metadata.duration.toFixed(1)} seconds` : 'Duration unavailable'}</span>
        ) : <span>Reading video…</span>}
        <span>WEBGL2 · MUTED</span>
      </div>
    </div>
  );
}
