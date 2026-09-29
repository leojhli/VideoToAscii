'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { createVideoRenderer } from '../rendering/videoRenderer';
import type { MatchingMode } from '../rendering/videoRenderer';
import { DEFAULT_SETTINGS } from '../rendering/settings';
import type { AsciiSettings } from '../rendering/settings';

export type VideoMetadata = { width: number; height: number; duration: number };
export type VideoAsciiHandle = { play: () => Promise<void>; pause: () => void; seek: (seconds: number) => void };
export type VideoAsciiProps = Partial<AsciiSettings> & {
  src: string;
  matchingMode?: MatchingMode;
  autoPlay?: boolean;
  loop?: boolean;
  paused?: boolean;
  className?: string;
  style?: CSSProperties;
  label?: string;
  crossOrigin?: 'anonymous' | 'use-credentials';
  onError?: (message: string) => void;
  onReady?: () => void;
  onMetadata?: (metadata: VideoMetadata) => void;
  onGrid?: (grid: { columns: number; rows: number }) => void;
  onPlaybackChange?: (playing: boolean) => void;
  onTimeChange?: (seconds: number) => void;
};

export const VideoAscii = forwardRef<VideoAsciiHandle, VideoAsciiProps>(function VideoAscii({
  src, columns = DEFAULT_SETTINGS.columns, brightness = 1, contrast = 1, gamma = 1, opacity = 1,
  colorMode = 'color', foregroundColor = '#ffffff', backgroundColor = '#000000',
  characterSet = DEFAULT_SETTINGS.characterSet, matchingMode = 'shape', autoPlay = true, loop = true,
  paused, className, style, label = 'ASCII video', crossOrigin = 'anonymous', ...callbacks
}, ref) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<ReturnType<typeof createVideoRenderer> | null>(null);
  const callbacksRef = useRef(callbacks);
  const generation = useRef(0);
  const [error, setError] = useState('');
  const [settingsError, setSettingsError] = useState('');
  useEffect(() => { callbacksRef.current = callbacks; });

  function report(message: string) {
    setError(message);
    callbacksRef.current.onError?.(message);
  }

  async function play() {
    const video = videoRef.current;
    if (!video || !video.getAttribute('src')) return;
    const current = generation.current;
    try {
      if (video.ended) video.currentTime = 0;
      await video.play();
    } catch (cause) {
      if (generation.current !== current || (cause instanceof DOMException && cause.name === 'AbortError')) return;
      report('Playback could not start. Use a play control to retry, or check the video format.');
    }
  }

  useImperativeHandle(ref, () => ({
    play,
    pause() { videoRef.current?.pause(); },
    seek(seconds) {
      const video = videoRef.current;
      if (video && Number.isFinite(seconds) && Number.isFinite(video.duration)) {
        video.currentTime = Math.max(0, Math.min(video.duration, seconds));
      }
    },
  }));

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    setError('');
    callbacksRef.current.onPlaybackChange?.(false);
    callbacksRef.current.onTimeChange?.(0);
    let renderer: ReturnType<typeof createVideoRenderer> | undefined;
    canvas.width = canvas.width;
    if (src.trim()) {
      video.crossOrigin = crossOrigin;
      video.src = src;
      try {
        renderer = createVideoRenderer(canvas, video, report, () => {
          setError(''); callbacksRef.current.onReady?.();
        }, (grid) => callbacksRef.current.onGrid?.(grid));
        rendererRef.current = renderer;
      } catch (cause) {
        report(cause instanceof Error ? cause.message : 'Unable to start WebGL2.');
      }
    }
    return () => {
      generation.current++;
      renderer?.();
      rendererRef.current = null;
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
  }, [src, crossOrigin]);

  useEffect(() => {
    try {
      rendererRef.current?.updateSettings({ columns, brightness, contrast, gamma, opacity, colorMode, foregroundColor, backgroundColor, characterSet });
      rendererRef.current?.setMode(matchingMode);
      setSettingsError('');
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Invalid ASCII settings.';
      setSettingsError(message);
      callbacksRef.current.onError?.(message);
    }
  }, [src, crossOrigin, columns, brightness, contrast, gamma, opacity, colorMode, foregroundColor, backgroundColor, characterSet, matchingMode]);

  useEffect(() => {
    if (paused === true || (paused === undefined && !autoPlay)) videoRef.current?.pause();
    else void play();
  }, [src, crossOrigin, paused, autoPlay]);

  return <div className={className} style={{ position: 'relative', width: '100%', height: '100%', ...style }}>
    <video ref={videoRef} hidden muted playsInline loop={loop} preload="auto" aria-label={label}
      onLoadedMetadata={(event) => {
        const video = event.currentTarget;
        callbacksRef.current.onMetadata?.({ width: video.videoWidth, height: video.videoHeight, duration: video.duration });
      }}
      onPlay={() => {
        setError((previous) => previous.startsWith('Playback could not start.') ? '' : previous);
        callbacksRef.current.onPlaybackChange?.(true);
      }}
      onPause={() => callbacksRef.current.onPlaybackChange?.(false)}
      onEnded={() => callbacksRef.current.onPlaybackChange?.(false)}
      onTimeUpdate={(event) => callbacksRef.current.onTimeChange?.(event.currentTarget.currentTime)}
      onError={() => report('This browser could not play the file. Check its format and, for remote URLs, CORS permissions.')} />
    <canvas ref={canvasRef} role="img" aria-label={`WebGL ${label}`} style={{ display: 'block', width: '100%', height: '100%' }} />
    {(error || settingsError) && <div role="alert" style={{ position: 'absolute', inset: '12px 12px auto', color: '#ffb2a2', background: '#181d19', padding: 12 }}>{error || settingsError}</div>}
  </div>;
});
