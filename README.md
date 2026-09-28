# Video to ASCII

A React learning project, built one milestone at a time. The destination is a reusable **WebGL2 video-to-ASCII renderer** and a standalone playground for tuning it.

Milestone 2 renders local video frames on a WebGL2 canvas, with play/pause, seeking, aspect-ratio-preserving resizing, and GPU context recovery. ASCII rendering is the next milestone and is not implemented yet.

## Run locally

Use Node.js 22.12+ or a newer supported LTS release (developed with Node 24).

```sh
npm install
npm run dev
```

Open the local URL printed in the terminal. Select a video and press Play. Playback is muted. Files stay in your browser; the app does not upload them. MP4 and WebM are suggested, but actual playback depends on the codecs in the file and browser support. WebGL2 is required; unavailable hardware acceleration produces an error. Seeking is enabled when the file has a finite duration.

```sh
npm test
npm run test:browser
npm run build
npm run preview
```

The build checks TypeScript and creates deployable files in dist/. Preview serves that build locally. Unit tests exercise UI behavior and resource cleanup with mocked APIs. The browser test uses installed Microsoft Edge to record a local test video, verify rendered pixel colors/orientation, and exercise pause, resizing, context recovery, and removal. Install Edge to run that test with the current Playwright configuration.

## Files to read

- `src/main.tsx`: React startup and global CSS.
- `src/App.tsx`: page layout, selected file state, and input validation.
- `src/components/VideoPreview.tsx`: media element, metadata, errors, and object URL cleanup.
- `src/rendering/videoRenderer.ts`: WebGL2 shaders, video texture, frame scheduling, resizing, and GPU resource lifecycle.
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
