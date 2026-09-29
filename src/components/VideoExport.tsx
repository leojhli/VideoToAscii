import { useEffect, useRef, useState } from 'react';
import { exportVideo } from '../export/exportVideo';
import type { AsciiSettings } from '../rendering/settings';
import type { MatchingMode } from '../rendering/videoRenderer';

export function VideoExport({ src, fileName, settings, matchingMode, disabled }: {
  src: string; fileName: string; settings: AsciiSettings; matchingMode: MatchingMode; disabled: boolean;
}) {
  const active = useRef<AbortController | null>(null);
  const url = useRef('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ url: string; name: string } | null>(null);
  useEffect(() => () => {
    active.current?.abort(); active.current = null;
    if (url.current) URL.revokeObjectURL(url.current);
  }, [src]);

  async function generate() {
    const controller = new AbortController();
    active.current = controller;
    if (url.current) { URL.revokeObjectURL(url.current); url.current = ''; }
    setResult(null); setError(''); setBusy(true); setProgress('Preparing export…');
    try {
      const blob = await exportVideo(src, settings, matchingMode, controller.signal, (seconds, duration) => {
        if (active.current === controller) setProgress(Number.isFinite(duration)
          ? `Recording ${Math.min(100, Math.round(seconds / duration * 100))}%`
          : `Recording ${seconds.toFixed(1)} seconds`);
      });
      if (active.current !== controller) return;
      url.current = URL.createObjectURL(blob);
      setResult({ url: url.current, name: `${fileName.replace(/\.[^.]+$/, '')}-ascii.${blob.type.includes('mp4') ? 'mp4' : 'webm'}` });
      setProgress('Export ready. Save the video below.');
    } catch (failure) {
      if (active.current !== controller) return;
      if (controller.signal.aborted) setProgress('Export cancelled.');
      else { setError(failure instanceof Error ? failure.message : 'Export failed.'); setProgress(''); }
    } finally {
      if (active.current === controller) { active.current = null; setBusy(false); }
    }
  }

  return <section className="export-controls" aria-label="Download ASCII video">
    <button className="text-button" disabled={disabled || busy || !src} onClick={generate}>Generate ASCII video</button>
    {busy && <button className="text-button" onClick={() => active.current?.abort()}>Cancel export</button>}
    {result && <a href={result.url} download={result.name}>Save ASCII video</a>}
    <p className="hint">Records the whole video with your current settings, silently, up to 1920 pixels on the longest side. Export takes the video's playback time; keep this tab visible. Changes made during export apply only to your next export. Opacity is flattened onto black.</p>
    <p aria-live="polite">{progress}</p>
    {error && <p className="error" role="alert">{error}</p>}
  </section>;
}
