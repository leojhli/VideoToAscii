import { useEffect, useRef, useState } from 'react';
import type { MatchingMode } from '../rendering/videoRenderer';
import { VideoAscii } from './VideoAscii';
import type { VideoAsciiHandle } from './VideoAscii';
import { DEFAULT_SETTINGS } from '../rendering/settings';
import { AsciiControls } from './AsciiControls';
import { readableGrid } from '../rendering/glyphAtlas';

type VideoPreviewProps = { file: File };
type Metadata = { width: number; height: number; duration: number };

export function VideoPreview({ file }: VideoPreviewProps) {
  const playerRef = useRef<VideoAsciiHandle>(null);
  const [src, setSrc] = useState('');
  const stageRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState('');
  const [matchingMode, setMatchingMode] = useState<MatchingMode>('shape');
  const [settings, setSettings] = useState({ ...DEFAULT_SETTINGS });
  const [maxColumns, setMaxColumns] = useState(500);
  const maxColumnsRef = useRef(500);
  const [grid, setGrid] = useState<{ columns: number; rows: number } | null>(null);
  const [metadata, setMetadata] = useState<Metadata | null>(null);
  const [error, setError] = useState('');
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setSrc(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  useEffect(() => {
    if (!metadata) return;
    const updateLimit = () => {
      const canvas = stageRef.current?.querySelector('canvas');
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const toolbar = stageRef.current?.querySelector('.stage-toolbar')?.getBoundingClientRect().height ?? 50;
      const width = fullscreen ? rect.width : (window.screen.width || window.innerWidth);
      const height = fullscreen ? rect.height : Math.max(1, (window.screen.height || window.innerHeight) - toolbar);
      const limit = readableGrid(metadata.width, metadata.height, 500, width, height).columns;
      const previousLimit = maxColumnsRef.current;
      maxColumnsRef.current = limit;
      setMaxColumns(limit);
      setSettings((previous) => {
        const columns = previous.columns === previousLimit ? limit : Math.min(previous.columns, limit);
        return columns === previous.columns ? previous : { ...previous, columns };
      });
    };
    updateLimit();
    window.addEventListener('resize', updateLimit);
    window.screen.orientation?.addEventListener('change', updateLimit);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateLimit);
    const canvas = stageRef.current?.querySelector('canvas');
    if (canvas) observer?.observe(canvas);
    return () => {
      window.removeEventListener('resize', updateLimit);
      window.screen.orientation?.removeEventListener('change', updateLimit);
      observer?.disconnect();
    };
  }, [metadata, fullscreen]);

  useEffect(() => {
    const syncFullscreen = () => setFullscreen(document.fullscreenElement === stageRef.current);
    document.addEventListener('fullscreenchange', syncFullscreen);
    return () => document.removeEventListener('fullscreenchange', syncFullscreen);
  }, []);

  async function toggleFullscreen() {
    setFullscreenError('');
    try {
      if (document.fullscreenElement === stageRef.current) await document.exitFullscreen();
      else await stageRef.current?.requestFullscreen();
    } catch {
      setFullscreenError('Fullscreen could not open. Try again or check your browser’s fullscreen permissions.');
    }
  }

  async function togglePlayback() {
    if (playing) playerRef.current?.pause();
    else await playerRef.current?.play();
  }

  return (
    <div className="video-preview">
      <div className="preview-stage" ref={stageRef}>
        <div className="gpu-preview">
          <VideoAscii ref={playerRef} src={src} {...settings} matchingMode={matchingMode} autoPlay={false} loop={false}
            label={`Preview of ${file.name}`} onMetadata={setMetadata} onGrid={setGrid} onError={setError}
            onReady={() => setError('')} onPlaybackChange={setPlaying} onTimeChange={setCurrentTime} />
        </div>
        <div className="stage-toolbar">
          <span className="hint">{fullscreen ? `${grid?.columns ?? '—'} columns · Press Esc to exit fullscreen` : 'Expand the preview for more readable characters'}</span>
          <button className="text-button fullscreen-play" disabled={!metadata} onClick={togglePlayback}>{playing ? 'Pause' : 'Play'}</button>
          <button className="text-button" aria-pressed={fullscreen} disabled={!document.fullscreenEnabled} onClick={toggleFullscreen}
            title={document.fullscreenEnabled ? undefined : 'Fullscreen is unavailable in this browser'}>{fullscreen ? 'Exit fullscreen' : 'Fullscreen'}</button>
        </div>
        {fullscreenError && <p className="render-error error" role="alert">{fullscreenError}</p>}
      </div>
      <div className="matching-control">
        <label htmlFor="matching-mode">Character matching</label>
        <select id="matching-mode" value={matchingMode} onChange={(event) => {
          const mode = event.currentTarget.value as MatchingMode;
          setMatchingMode(mode);
        }}>
          <option value="shape">Shape + brightness</option>
          <option value="luminance">Brightness only</option>
        </select>
      </div>
      <div className="playback-controls">
        <button className="text-button" disabled={!metadata} onClick={togglePlayback}>{playing ? 'Pause' : 'Play'}</button>
        <label htmlFor="video-seek">Seek</label>
        <input id="video-seek" type="range" min="0" max={Number.isFinite(metadata?.duration) ? metadata!.duration : 0} step="0.01" value={currentTime}
          disabled={!metadata || !Number.isFinite(metadata.duration) || !!error}
          onChange={(event) => { const time = Number(event.currentTarget.value); playerRef.current?.seek(time); setCurrentTime(time); }} />
        <span>{currentTime.toFixed(1)}s</span>
      </div>
      {grid && <p className="grid-status hint">Character grid: {grid.columns} × {grid.rows}{grid.columns < settings.columns ? ` · ${settings.columns} requested; limited to fit readable characters` : ''}</p>}
      <AsciiControls settings={settings} maxColumns={maxColumns} onChange={setSettings} onReset={() => {
        setSettings({ ...DEFAULT_SETTINGS, columns: Math.min(DEFAULT_SETTINGS.columns, maxColumns) }); setMatchingMode('shape');
      }} />
      <div className="preview-status" role="status">
        {error ? <span className="error">{error}</span> : metadata ? (
          <span>{metadata.width} × {metadata.height} px · {Number.isFinite(metadata.duration) ? `${metadata.duration.toFixed(1)} seconds` : 'Duration unavailable'}</span>
        ) : <span>Reading video…</span>}
        <span>WEBGL2 · MUTED</span>
      </div>
    </div>
  );
}
