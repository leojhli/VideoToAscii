# Video to ASCII: durable project context

## Goal and learning agreement

Build a standalone React playground containing an original reusable video-to-ASCII component for the user's future React portfolio. Implement one milestone at a time. Latest user preference: no tutorials or explanation text files; implement the work and give concise status. This supersedes earlier requests for detailed explanations.

Latest architecture decision: use WebGL2 from the start, not a Canvas 2D ASCII implementation. The reference https://github.com/LucasHJin/react-video-ascii is inspiration, not a dependency. GPU rendering and shape-based glyph matching are implemented as of milestone 3 using an original six-region descriptor approach.

## Desired finished behavior

- Local video selection in the playground; source URL prop in a reusable portfolio component.
- Live rendering is necessary so portfolio visitors can change columns, brightness, contrast, gamma, opacity, color/monochrome mode, and character set.
- Muted playback, play/pause, responsive sizing, suitable cleanup and visibility handling.
- Copy the finished component and source video into the future portfolio. No npm publication, backend, or video export is currently required.
- Final portfolio view displays the ASCII rendering only. Milestone 1 deliberately shows the ordinary source video for learning and verification.

## Current milestone: 3

Implemented a Vite + React + TypeScript app with a responsive local video picker, original preview, file name/size, decoded dimensions/duration, browser playback controls, remove/replace, empty-file and MIME checks, and decoder error feedback. Files with missing MIME types are tried by the decoder. Selection cancellation leaves the current preview alone. Invalid selections leave the existing preview intact.

App owns selection and validation. VideoPreview owns the video DOM ref and the object URL lifecycle. Changing the selection remounts VideoPreview using a changing React key, clearing old status. Effect cleanup pauses playback, removes src, resets the media element, and revokes the URL. React Strict Mode stays enabled.

Milestone 2 adds a WebGL2 renderer in src/rendering/videoRenderer.ts. A full-screen triangle generated with gl_VertexID samples the video texture. The video element is now hidden; a visible canvas displays original frames, with custom muted Play/Pause and Seek controls. requestVideoFrameCallback drives uploads with requestAnimationFrame fallback. Loading, paused seeking, resize, and context restoration redraw the frame; paused/ended playback and hidden tabs stop the frame loop. ResizeObserver preserves video proportions in a letterboxed viewport; DPR is capped at 2 and drawing-buffer dimensions at 4096/device limits. Oversized source textures and unavailable WebGL2 produce explicit errors. Cleanup releases textures, shaders, programs, VAOs, callbacks, observers, event listeners, media, and object URLs. Context restoration rebuilds GPU resources.

Milestone 3 adds colored ASCII conversion. glyphAtlas.ts rasterizes a fixed ASCII set with a system monospace font into 12x20 tiles once at renderer initialization, measures six regions per glyph, sorts by mean ink coverage, and uploads the atlas and RGBA32F descriptor texture. This one-time Canvas 2D font rasterization is not a Canvas video converter. Per-frame work remains on the GPU.

asciiShaders.ts contains a two-pass pipeline. The first pass runs per character cell, samples 24 source points grouped into a 2x3 descriptor, and chooses the glyph minimizing normalized density error plus contrast-weighted centered shape error. Brightness-only mode omits shape error. The RGBA8 cell framebuffer encodes glyph index in R and mean source color in GBA; dithering is disabled to preserve the index. The second pass draws the chosen atlas glyph in its source color on black. The atlas has half-texel bounds to prevent bleeding. Default mode is shape; an in-place renderer setMode method redraws paused frames without video reload. The cleanup function remains callable and also exposes setMode.

The responsive grid uses at most 100 columns (approximately six CSS pixels per cell minimum) and rows adjusted by the 12:20 glyph aspect ratio. Two shader programs, four textures, a cell framebuffer, and a VAO are released/rebuilt along the existing renderer lifecycle. Full image controls (columns, brightness, contrast, gamma, opacity, custom character sets, monochrome) are still milestone 4. Seeking requires a finite duration; some recorded WebM files report Infinity and therefore play without seeking. Platform monospace fonts may produce slightly different glyph shapes/densities.

## Roadmap

1. React foundation and video input (completed).
2. WebGL2 frame rendering and resource lifecycle (implemented).
3. GPU ASCII conversion: glyph atlas, aspect-correct grid, luminance mapping, and shape-aware glyph selection (completed).
4. Live image controls and playback, with documented formulas and limits.
5. Extract the reusable component with src/settings props and separate playground UI.
6. Visibility, resizing, performance caps, context-loss handling, browser validation, and portfolio integration guidance.

## Verification

Milestone 3 verification: 17 unit tests pass; npm run build passes TypeScript checking and production bundling. The Playwright test in installed Microsoft Edge passed using a browser-generated striped/red/blue WebM: output has separated glyph ink/background, correct color orientation, different shape/luminance output on patterned input, and deterministic switching without changing the source URL. Playback pause, paused resize, GPU context recovery, zero WebGL errors, and removal also pass. Chrome/Firefox/Safari have not been tested. Browser tests run outside the sandbox because sandbox browser teardown previously stalled.

Run npm test and npm run build. Tests cover URL cleanup on replacement/removal/unmount, Strict Mode, invalid files, MIME-less files, decoder errors, and metadata. DOM tests mock media decoding and do not establish that real videos play in browsers. Manually select a real video, play/pause/seek, replace/remove, and test a narrow viewport. Browser codec support varies.

## Continuity

Read AGENTS.md first. Keep this file updated. MILESTONE_1_EXPLANATION_TEMP.txt was removed as requested; do not recreate it or add further explanation text files. README and this context remain. Files are local until committed and pushed; no GitHub push has been performed.
