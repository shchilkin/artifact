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
