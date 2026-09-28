# Video to ASCII: durable project context

## Goal and learning agreement

Build a standalone React playground containing an original reusable video-to-ASCII component for the user's future React portfolio. Implement one milestone at a time. Latest user preference: no tutorials or explanation text files; implement the work and give concise status. This supersedes earlier requests for detailed explanations.

Latest architecture decision: use WebGL2 from the start, not a Canvas 2D ASCII implementation. The reference https://github.com/LucasHJin/react-video-ascii is inspiration, not a dependency. GPU rendering and eventual shape-based glyph matching are the target. The exact glyph-matching algorithm will be specified when that milestone starts; it has not been implemented.

## Desired finished behavior

- Local video selection in the playground; source URL prop in a reusable portfolio component.
- Live rendering is necessary so portfolio visitors can change columns, brightness, contrast, gamma, opacity, color/monochrome mode, and character set.
- Muted playback, play/pause, responsive sizing, suitable cleanup and visibility handling.
- Copy the finished component and source video into the future portfolio. No npm publication, backend, or video export is currently required.
- Final portfolio view displays the ASCII rendering only. Milestone 1 deliberately shows the ordinary source video for learning and verification.

## Current milestone: 2

Implemented a Vite + React + TypeScript app with a responsive local video picker, original preview, file name/size, decoded dimensions/duration, browser playback controls, remove/replace, empty-file and MIME checks, and decoder error feedback. Files with missing MIME types are tried by the decoder. Selection cancellation leaves the current preview alone. Invalid selections leave the existing preview intact.

App owns selection and validation. VideoPreview owns the video DOM ref and the object URL lifecycle. Changing the selection remounts VideoPreview using a changing React key, clearing old status. Effect cleanup pauses playback, removes src, resets the media element, and revokes the URL. React Strict Mode stays enabled.

Milestone 2 adds a WebGL2 renderer in src/rendering/videoRenderer.ts. A full-screen triangle generated with gl_VertexID samples the video texture. The video element is now hidden; a visible canvas displays original frames, with custom muted Play/Pause and Seek controls. requestVideoFrameCallback drives uploads with requestAnimationFrame fallback. Loading, paused seeking, resize, and context restoration redraw the frame; paused/ended playback and hidden tabs stop the frame loop. ResizeObserver preserves video proportions in a letterboxed viewport; DPR is capped at 2 and drawing-buffer dimensions at 4096/device limits. Oversized source textures and unavailable WebGL2 produce explicit errors. Cleanup releases textures, shaders, programs, VAOs, callbacks, observers, event listeners, media, and object URLs. Context restoration rebuilds GPU resources.

ASCII conversion and ASCII controls are not implemented yet. Seeking requires a finite duration; some recorded WebM files report Infinity and therefore play without seeking.

## Roadmap

1. React foundation and video input (completed).
2. WebGL2 frame rendering and resource lifecycle (implemented).
3. GPU ASCII conversion: glyph atlas, character grid with aspect-ratio correction, luminance mapping, then shape-aware glyph selection as part of the full WebGL target.
4. Live image controls and playback, with documented formulas and limits.
5. Extract the reusable component with src/settings props and separate playground UI.
6. Visibility, resizing, performance caps, context-loss handling, browser validation, and portfolio integration guidance.

## Verification

Milestone 2 verification: 12 unit tests pass; npm run build passes TypeScript checking and production bundling. The Playwright test in installed Microsoft Edge passed using a browser-generated WebM: decoded video pixels were uploaded/rendered correctly with upright red/blue orientation, playback paused, paused resizing worked, GPU context recovered, and removal left no canvas or JavaScript exceptions. Chrome/Firefox/Safari have not been tested.

Run npm test and npm run build. Tests cover URL cleanup on replacement/removal/unmount, Strict Mode, invalid files, MIME-less files, decoder errors, and metadata. DOM tests mock media decoding and do not establish that real videos play in browsers. Manually select a real video, play/pause/seek, replace/remove, and test a narrow viewport. Browser codec support varies.

## Continuity

Read AGENTS.md first. Keep this file updated. MILESTONE_1_EXPLANATION_TEMP.txt was removed as requested; do not recreate it or add further explanation text files. README and this context remain. Files are local until committed and pushed; no GitHub push has been performed.
