import { createRoot } from 'react-dom/client';
import { VideoAscii } from '../video-ascii';

const src = new URLSearchParams(window.location.search).get('src') ?? '';
createRoot(document.getElementById('root')!).render(
  <main style={{ height: '100dvh' }}>
    {src ? <VideoAscii src={src} columns={180} gamma={1.2} label="Portfolio background" />
      : <p style={{ padding: 24 }}>Provide a video URL with ?src=/your-video.mp4</p>}
  </main>,
);
