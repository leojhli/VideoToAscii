import { useState } from 'react';
import type { ChangeEvent } from 'react';
import { VideoPreview } from './components/VideoPreview';

export default function App() {
  const [selection, setSelection] = useState<{ file: File; id: number } | null>(null);
  const [error, setError] = useState('');

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    // Reset the picker so choosing the same file again also fires a change event.
    event.currentTarget.value = '';
    if (!file) return;

    if (file.size === 0) {
      setError('This file is empty. Choose a video with content.');
      return;
    }
    // Some operating systems leave MIME type blank. Let the video decoder try those files.
    if (file.type && !file.type.startsWith('video/')) {
      setError('Choose a video file, such as an MP4 or WebM.');
      return;
    }

    setError('');
    setSelection((previous) => ({ file, id: (previous?.id ?? 0) + 1 }));
  }

  return (
    <main className="app-shell">
      <header className="masthead">
        <a className="wordmark" href="./"><span aria-hidden="true">[a]</span> VIDEO / ASCII</a>
        <span className="badge">LOCAL VIDEO LAB</span>
      </header>

      <section className="intro">
        <p className="eyebrow">VIDEO TO ASCII / LIVE STUDIO</p>
        <h1>Your video.<br />A thousand characters<span className="accent">.</span></h1>
        <p className="lede">Turn a local clip into colored ASCII, rendered live in your browser.</p>
      </section>

      <section className="workspace" aria-label="Video workspace">
        <aside className="source-panel">
          <p className="eyebrow">INPUT</p>
          <h2>Your source video</h2>
          <p>Pick a video from your device. Your browser opens it locally; nothing is uploaded.</p>
          <label className="file-label" htmlFor="video-file">Choose a video</label>
          <input id="video-file" type="file" accept="video/*" onChange={handleFileChange} aria-describedby="file-help" />
          <p id="file-help" className="hint">MP4 or WebM recommended. Playback depends on your browser’s codec support.</p>
          {error && <p role="alert" className="error">{error}</p>}
          {selection && (
            <div className="file-details">
              <span className="eyebrow">SELECTED FILE</span>
              <strong>{selection.file.name}</strong>
              <span>{(selection.file.size / (1024 * 1024)).toFixed(2)} MB</span>
              <button className="text-button" onClick={() => { setSelection(null); setError(''); }}>Remove video</button>
            </div>
          )}
        </aside>

        <div className="preview-panel">
          <div className="panel-heading"><span>ASCII preview</span><span className="hint">WEBGL2</span></div>
          {selection ? (
            // A new key remounts the preview, clearing old media status on replacement.
            <VideoPreview key={selection.id} file={selection.file} />
          ) : (
            <div className="empty-preview">
              <span className="empty-symbol" aria-hidden="true">[ : : ]</span>
              <h2>A little motion, please.</h2>
              <p>Your video will appear here.</p>
            </div>
          )}
        </div>
      </section>

      <footer><span>ON YOUR DEVICE. IN YOUR CONTROL.</span><span>WebGL2 · Ready for your portfolio</span></footer>
    </main>
  );
}
