# Video to ASCII

A React and TypeScript app for converting video into ASCII using WebGL2, with a reusable renderer and a standalone playground for tuning it.

The app includes a reusable `VideoAscii` component, a standalone portfolio example, live image controls, video downloads, and fullscreen viewing. Offscreen suspension, a playback frame cap, and GPU resource reuse keep rendering efficient. Edge is verified; Firefox/WebKit verification remains pending due to browser download failures in the development environment.

## Performance and compatibility

- Playback rendering is capped at 30 FPS; seeking, resizing, and image controls redraw immediately when visible. This does not change the video's playback speed.
- GPU drawing stops in hidden tabs, offscreen previews, and zero-size containers. Visibility/resize resumes rendering. Media decoding can continue while the GPU renderer is suspended.
- Video texture storage is reused with sub-image uploads. Paused settings changes reuse the uploaded frame, and shader uniform locations are cached until context recovery.
- Drawing-buffer DPR is capped at 2, dimensions at 4096/device limits, columns at 500, and rows at 1,000. These are bounds, not a guarantee of 30 FPS on every device.
- Context recovery rebuilds GPU resources with the current settings. Cleanup cancels callbacks and disconnects both visibility and resize observers.
- Modern browsers need WebGL2, ResizeObserver, and a supported video codec. Missing IntersectionObserver falls back to tab-visibility handling. Missing video-frame callbacks falls back to animation frames, skipping unchanged media timestamps.

For portfolio integration, use short appropriately sized local assets, a parent with a defined height, and a visible play/pause control for moving backgrounds. If respecting reduced-motion preferences, pass `autoPlay={false}` or control `paused` from your site's preference handling. Cross-origin video hosts must return CORS headers. Verify target phones, actual Safari, and the deployed video's codec before relying on it as essential content.

Validation in this environment: 40 unit tests, the production build, and the full Edge integration test pass (including playable ASCII downloads, cancellation, fixed fullscreen grid, and actual offscreen stop/resume). Firefox/WebKit runs could not complete: required binary downloads timed out; older cached builds were incompatible/stalled. This does not establish Firefox or Safari compatibility.

```sh
npx playwright install firefox webkit
npm run test:browser:all
```

`npm run test:browser` runs installed Edge only. `test:browser:all` runs Edge plus Playwright Firefox and WebKit after installing their matching binaries. Playwright WebKit on Windows is not a substitute for device testing in Safari on macOS/iOS.

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

Use **Fullscreen** beneath the preview to enlarge the ASCII canvas. The character grid stays the same; characters simply appear larger in fullscreen and smaller in the normal preview. Play/pause remains available; click **Exit fullscreen** or press **Esc** to return. Fullscreen requires browser support and permission.

The resolution slider maximum estimates a readable fullscreen limit for the current video and screen (up to 500), reserving 64 pixels for the toolbar and targeting 8-pixel-wide characters. Both views use this same limit. Screen/orientation changes update the maximum; changing only the preview size does not. A selection at maximum follows a new screen maximum; lower selections are preserved unless they exceed the limit. Reset also respects this limit.

Use Node.js 22.12+ or a newer supported LTS release (developed with Node 24).

```sh
npm install
npm run dev
```

Open the local URL printed in the terminal. Select a video and press Play. Playback is muted. Files stay in your browser; the app does not upload them. MP4 and WebM are suggested, but actual playback depends on the codecs in the file and browser support. WebGL2 is required; unavailable hardware acceleration produces an error. Seeking is enabled when the file has a finite duration.

Resolution sets character columns, not video pixel dimensions. The renderer uses the selected count regardless of its display size. Rows account for the font cell's 12:20 aspect ratio, with a 1,000-row safety limit (exceptionally tall sources reduce columns too). The UI shows the actual grid. Shape matching combines six-region spatial descriptors with luminance; brightness-only mode selects glyphs by measured ink coverage. The browser's monospace font is rasterized when the character set changes; all per-frame conversion runs on the GPU. Font appearance can vary across operating systems.

## Download the ASCII video

Click **Generate ASCII video**, wait for recording to finish, then **Save ASCII video**. It exports the whole clip from the beginning using a snapshot of the current settings and matching mode, independently of preview playback. The output is a silent WebM (MP4 fallback when supported), not a text file. The grid stays identical to the preview, rasterized with a 1920-pixel longest side and even dimensions. Small sources are upscaled for sharper glyphs, not additional source detail. Opacity is flattened onto black; saved videos have baked-in settings.

Export runs locally in real time, targets 30 FPS, and requires MediaRecorder/canvas capture support. Keep the tab visible; hiding it stops the export with a retry message. Cancel, source removal, or unmount releases recording, GPU, and media resources. Previous download URLs are revoked on regeneration or unmount. Output is buffered in memory with a 512 MB safety limit; prefer short clips. Encoding quality, codec availability, frame rate, and resulting seek metadata vary by browser. No source or output is uploaded.

`src/export/exportVideo.ts` owns recording; `src/components/VideoExport.tsx` owns progress, cancellation, and the save link. These are playground features, not dependencies of the reusable portfolio component.

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

## Manual checks

Select a real video, play/pause/seek, and confirm its dimensions and duration. Replace it, select the same file again, then remove it. Try an empty file and an unplayable video. Resize to a narrow viewport and navigate the controls with the keyboard.

## References

- [Vite: getting started](https://vite.dev/guide/)
- [React: useEffect and cleanup](https://react.dev/reference/react/useEffect)
- [MDN: releasing object URLs](https://developer.mozilla.org/en-US/docs/Web/API/URL/revokeObjectURL_static)
- [MDN: video textures in WebGL](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/Tutorial/Animating_textures_in_WebGL)
