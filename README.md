# Video to ASCII

A React learning project, built one milestone at a time. The destination is a reusable **WebGL2 video-to-ASCII renderer** and a standalone playground for tuning it.

Milestone 5 extracts a reusable `VideoAscii` component, now used by both the playground and a standalone portfolio example. The existing image controls, readable resolution limits, and fullscreen behavior remain available in the playground.

## Use in a React portfolio

Copy `src/video-ascii.ts`, `src/components/VideoAscii.tsx`, and the non-test files in `src/rendering/` into your React project, preserving their relative paths. Only React and React DOM are required at runtime; no playground CSS is needed. Host the original video in your site's public assets.

```tsx
import { VideoAscii } from './video-ascii';

export function Hero() {
  return (
    <div style={{ width: '100%', height: '70vh' }}>
      <VideoAscii src="/videos/hero.mp4" columns={180} gamma={1.2} opacity={0.85} />
    </div>
  );
}
```

The parent must have a nonzero height. The component fills its parent and displays only the ASCII canvas and any error message; it has no upload or settings UI. The original video is hidden, muted, and inline. Default playback is autoplay and looping; browsers may still reject autoplay, reported through `onError`.

Props: required `src`; optional `columns`, `brightness`, `contrast`, `gamma`, `opacity`, `colorMode`, `foregroundColor`, `backgroundColor`, `characterSet`, `matchingMode`, `autoPlay`, `loop`, `paused`, `className`, `style`, `label`, and `crossOrigin`. Appearance defaults match the playground. `paused`, when provided, controls playback and takes precedence over `autoPlay`. `crossOrigin` defaults to `anonymous`; remote hosts must permit CORS access for WebGL textures. An empty `src` clears the preview without fetching the page URL. Blob URL creation/revocation belongs to the caller.

Optional callbacks: `onError(message)`, `onReady()` (GPU initialized or restored), `onMetadata({ width, height, duration })`, `onGrid({ columns, rows })`, `onPlaybackChange(playing)`, and `onTimeChange(seconds)`. A `VideoAsciiHandle` ref exposes `play()`, `pause()`, and `seek(seconds)` for custom controls; use either these commands or the controlled `paused` prop to manage playback. The component includes a client-component directive for React frameworks that require it.

To run the standalone integration example, place a video in `public/` and open `/examples/portfolio.html?src=/your-video.mp4` through the dev server. That page intentionally imports no playground stylesheet and is also included in the production build. Appearance/callback prop updates do not recreate the renderer or reload the source; source changes and unmount release the old renderer and media resources.

## Run locally

Use **Fullscreen** beneath the preview to enlarge the ASCII canvas. More columns become available as the canvas grows, while each character stays at least 8 CSS pixels wide. Play/pause remains available; click **Exit fullscreen** or press **Esc** to return. Fullscreen requires browser support and permission.

The resolution slider maximum matches the readable fullscreen limit for the current video and screen (up to 500). Before entering fullscreen, it estimates the available area from the screen size minus the toolbar; once fullscreen, it uses the actual canvas size. Screen resize/orientation changes update the maximum. A selection at maximum follows the new maximum; lower selections are preserved unless they exceed the limit. Reset also respects this limit.

Use Node.js 22.12+ or a newer supported LTS release (developed with Node 24).

```sh
npm install
npm run dev
```

Open the local URL printed in the terminal. Select a video and press Play. Playback is muted. Files stay in your browser; the app does not upload them. MP4 and WebM are suggested, but actual playback depends on the codecs in the file and browser support. WebGL2 is required; unavailable hardware acceleration produces an error. Seeking is enabled when the file has a finite duration.

Resolution is a requested maximum character-column count, not video pixel dimensions. The renderer caps the actual grid to keep each cell at least 8 CSS pixels wide, using the fitted video's visible width (including portrait/letterbox considerations), independent of device pixel ratio. Fullscreen allows a denser grid without shrinking characters below that threshold; lower requested counts still produce larger characters. The UI shows actual columns and rows. Rows account for the font cell's 12:20 aspect ratio, with a 1,000-row safety limit. Shape matching combines six-region spatial descriptors with luminance; brightness-only mode selects glyphs by measured ink coverage. The browser's monospace font is rasterized when the character set changes; all per-frame conversion runs on the GPU. Font appearance can vary across operating systems.

Image controls use RGB values in [0,1]: multiply by brightness (0–2), apply contrast (0–3) around 0.5, clamp, then raise to 1/gamma (gamma 0.2–3). Gamma above 1 lifts midtones. The adjusted samples affect both glyph selection and source color. Opacity (0–1) applies to the entire canvas through CSS. Foreground color applies in monochrome mode; background color also fills letterboxing. Custom sets accept distinct printable ASCII characters, preserve spaces, and reject fewer than two distinct characters; duplicates are removed. Invalid edits leave the last applied set intact.

```sh
npm test
npm run test:browser
npm run build
npm run preview
```

The build checks TypeScript and creates deployable files in dist/. Preview serves that build locally. Unit tests exercise grid geometry, glyph descriptors, UI behavior, and resource cleanup with mocked APIs. The browser test uses installed Microsoft Edge to record a local patterned video, verify glyph coverage and color orientation, confirm matching modes produce different results without source reload, and exercise pause, resizing, context recovery, and removal. Install Edge to run that test with the current Playwright configuration.

## Files to read

- `src/main.tsx`: React startup and global CSS.
- `src/App.tsx`: page layout, selected file state, and input validation.
- `src/components/VideoPreview.tsx`: playground controls, fullscreen sizing, and local object URL ownership.
- `src/components/VideoAscii.tsx` and `src/video-ascii.ts`: reusable component, public props/ref types, media lifecycle, and exports.
- `src/rendering/videoRenderer.ts`: WebGL2 shaders, video texture, frame scheduling, resizing, and GPU resource lifecycle.
- `src/rendering/glyphAtlas.ts` and `asciiShaders.ts`: glyph rasterization/descriptors and GPU selection/display passes.
- `src/styles.css`: responsive styling with system fonts and no external assets.
- `src/App.test.tsx`: selection and lifecycle tests.
- `src/rendering/videoRenderer.test.ts` and `tests/browser/video.spec.ts`: renderer lifecycle and actual browser rendering checks.
- `PROJECT_CONTEXT.md`: long-term decisions, milestone state, and roadmap for future chats.
- `AGENTS.md`: instructions for assistants continuing the project.

## Manual checks

Select a real video, play/pause/seek, and confirm its dimensions and duration. Replace it, select the same file again, then remove it. Try an empty file and an unplayable video. Resize to a narrow viewport and navigate the controls with the keyboard.

## Learning references

- [Vite: getting started](https://vite.dev/guide/)
- [React: useEffect and cleanup](https://react.dev/reference/react/useEffect)
- [MDN: releasing object URLs](https://developer.mozilla.org/en-US/docs/Web/API/URL/revokeObjectURL_static)
- [MDN: video textures in WebGL](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/Tutorial/Animating_textures_in_WebGL)

Context files are part of this local Git repository. Commit and push them when ready to make them available on GitHub.
