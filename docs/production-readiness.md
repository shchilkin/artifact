# Production Readiness

This document is the release checklist for Artifact. It is intentionally
separate from the architecture roadmap: a feature can be exciting and still not
belong in the next production release.

## Release Gate

Run these before cutting a public release:

```bash
npm run check
npm run build
npm run test:browser
```

CI should run:

- `npm run check`
- `npm run build:ci`
- `npm run test:browser` in a browser-capable job with Chromium, Firefox, and
  WebKit installed. The suite includes desktop projects plus focused mobile
  Chromium/WebKit smoke.
- GitHub JavaScript actions should run with the Node 24 action runtime opt-in
  (`FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true`) so release checks do not carry
  the Node.js 20 action-runtime deprecation warning.

## Manual QA

### v0.23.0 Release Prep

- Automated release gate passed on 2026-05-26.
- `npm run check`, `npm run build`, and `npm run test:browser` passed.
- Full browser coverage passed across Chromium, Firefox, WebKit, mobile
  Chromium, and mobile WebKit with `206 passed, 11 skipped`.
- `npm run perf:node-editor` passed after rerunning outside the filesystem
  sandbox because the benchmark needs to bind `127.0.0.1:4174`.
- Focused coverage verifies Add Library drag-to-canvas, drag-to-edge insertion,
  edge splitting, undo/redo, and nonblank layer preview after insertion without
  changing document schema, graph traversal, renderer/export semantics, or
  thumbnail scheduling.
- Release notes live in `docs/releases/v0.23.0.md`.

### v0.22.0 Release Prep

- User verified the v0.22 project and asset robustness work locally before
  release prep.
- Automated browser coverage passed across Chromium, Firefox, WebKit, mobile
  Chromium, and mobile WebKit with `203 passed, 11 skipped`.
- Portable `.artifact.json` save/open, share-link hydration with practical
  payloads, local project roundtrip, stack export, graph export through the
  output node, missing imported image fallback, and missing imported font
  fallback were validated without changing graph traversal, renderer semantics,
  thumbnail scheduling, or document schema.
- Real imported font portability is covered by `.artifact.json` and local
  project roundtrips. URL share links still have browser/server size limits for
  large imported payloads.
- Release notes live in `docs/releases/v0.22.0.md`.

### v0.20.0 Release Prep

- User verified the v0.20 text workflow and follow-up fixes locally on
  2026-05-25.
- Automated browser coverage passed across Chromium, Firefox, WebKit, mobile
  Chromium, and mobile WebKit with `189 passed, 1 skipped`.
- Text starts, Font Library picker, curated font loading, multi-font starter
  flow, text control parity, transparent graph output, and graceful auth
  fallback were validated without adding document schema fields or changing
  graph traversal.
- Firefox CI exposed a no-WebGL environment. The release now falls back to the
  source canvas when a GPU-only Pixi effect cannot initialize, avoiding blank
  preview/export output in that environment.
- Release notes live in `docs/releases/v0.20.0.md`.

### v0.17.0 Release Prep

- User verified the renderer-backed Add Library preview direction locally on
  2026-05-24.
- Automated browser coverage passed across Chromium, Firefox, WebKit, mobile
  Chromium, and mobile WebKit with `174 passed, 1 skipped`.
- Creative controls, Add Library search/recent/popular flows, rendered Add
  Library previews, and node drag-to-canvas placement were validated without
  changing document semantics, graph traversal, thumbnail scheduling, AI scope,
  or export behavior.
- `npm run perf:node-editor` passed after fixing the benchmark launcher. Drag,
  slider, and pan interaction scenarios had zero long tasks and p95 frame times
  around `17-18ms`.
- Release notes live in `docs/releases/v0.17.0.md`.

### v0.16.0 Release Prep

- User verified the latest editor workflow polish locally on 2026-05-23.
- Automated browser coverage passed across Chromium, Firefox, WebKit, mobile
  Chromium, and mobile WebKit.
- Layer and node contrast/state changes were validated without changing render
  semantics, graph traversal, thumbnails, project persistence, or export
  behavior.
- Optional AI diagnostics were verified as debug-gated, with normal user
  sessions keeping the AI panel and console quiet.
- Release notes live in `docs/releases/v0.16.0.md`.

### v0.1.0-beta.1 Deployed Smoke

- Deployed beta was tested with a real cover workflow that used image, text,
  effect, merge, and output nodes.
- The workflow produced a usable album-cover result end to end.
- This validates the current beta as a working local editor, while leaving
  Safari, Firefox, and broader visual-regression coverage as follow-up work.

### Core Editor

- Open `/app` with an empty/localStorage document.
- Randomize the cover several times.
- Add, hide, duplicate, rename, reorder, and delete layers.
- Verify layer visibility changes the rendered canvas.
- Save a `.artifact.json` file and reopen it.
- Copy a share link and verify the document loads from `?doc=`.
- Confirm undo/redo after layer edits and continuous slider edits.

### Node Editor

- Switch layers -> nodes -> layers without a black canvas.
- Add a primitive node and rotate, pan, zoom, lock, and reset the camera.
- Confirm primitive scroll does not also zoom the graph when camera controls are active.
- Connect and disconnect simple graph paths.
- Open node gallery and confirm the same content appears in the node preview.
- Open and close context menus without accidental panel flicker.

### Rendering And Export

- Export a stack document.
- Export a graph document.
- Export a document with primitive, text, image, and effect layers.
- Compare the visible preview and exported file for composition parity.
- Check `1:1`, `4:5`, `9:16`, and `16:9` canvas ratios.
- Test export scale `1`, `2`, and `3` for effect-density parity.

### Browser Smoke

- Chrome/Chromium: automated browser suite required.
- Firefox: automated browser suite required.
- WebKit/Safari-family: automated browser suite required through Playwright
  WebKit.
- Mobile: automated Chromium/WebKit smoke required for shell layout and starter
  actions.
- Safari: manual pass on macOS before a public announcement.
- Mobile/tablet viewport: at least smoke-test opening, randomizing, and export UI visibility.

## Known Release Risks

- GPU/PixiJS shader output does not yet have visual snapshot tolerance.
- Three.js primitive visual parity is covered by browser smoke tests, not deterministic pixel tests.
- Imported image payloads are stored in IndexedDB for local editing, but
  `.artifact.json` export/share hydration can still create large portable
  payloads.
- `CanvasHandles` still commits text/image transform movement through document updates during pointer moves.
- Presets are localStorage-backed only.
- Projects and the pre-blank recovery draft are IndexedDB-backed convenience
  snapshots until account-backed persistence lands.

## Sticky-Note Feature Intake

The sticky-note ideas split into two tracks.

### Client-Only Or Mostly Client-Only

- Better empty-canvas onboarding and first-run UX.
- Dark/light theme mode.
- Layer folders/groups.
- Low-resolution / pixelate whole-image node.
- More procedural textures with presets.
- More focused effect nodes and shader-style effects.
- More primitive shapes, SVG-like primitives, and 3D sketches.
- Font import and better font browsing.
- Better text workflow and typography tooling.
- Better drag/repositioning UX.
- Physics/animation-style effects.
- Voice/music visualizer node using Web Audio.
- Better docs, examples, and tutorial presets.
- Better localization/i18n hooks.
- Downloadable local project packages with a custom extension for backups,
  offline ownership, and eventual PWA file handling.

### Full-Stack / VPS Candidates

- Accounts.
- Server-side project saving.
- Shareable server-backed project links.
- Preset database and community presets.
- User galleries or portfolio project pages.
- Case-study pages for portfolio/marketing.
- Subscription/paywall experiments.
- AI image generation node.
- Server-side asset storage for large uploads.
- Team/project collaboration.

## Release Decision

For a public beta, prioritize reliability over breadth:

1. CI green.
2. Browser smoke green.
3. Manual QA checklist complete.
4. Known risks accepted in release notes.
5. No new full-stack feature is added before the local editor release is stable.
