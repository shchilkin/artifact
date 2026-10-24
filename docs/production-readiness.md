# Production Readiness

This document is the release checklist for Artifact. It is intentionally
separate from the architecture roadmap: a feature can be exciting and still not
belong in the next production release.

## Release Gate

Run these before cutting a public release:

```bash
npm run release:verify
npm run check
npm run build
npm run loading:gate
npm run ux:gate
npm run test:browser:release
```

Release notes are template-gated. Before committing a release, copy
`docs/release-template.md` to `docs/releases/vX.Y.Z.md` and fill every required
section. Do not create a tag or GitHub Release from free-form notes.

CI should run:

- `npm run release:verify` when package metadata, release notes, version plans,
  production readiness notes, or release workflow files change.
- `npm run check`
- `npm run build:ci`
- `npm run loading:gate` in the Playwright container whenever the browser jobs
  run (and when `scripts/loading/` or `docs/loading/` change). It builds the web
  app with client source maps, measures every route-loading state in Chromium,
  and fails on any budget, prohibited-family, or root-graph violation of
  `docs/loading/route-loading-contract.json`; the measurement is uploaded as the
  `route-loading` artifact. See `docs/loading/route-loading-matrix.md` for how an
  intentional budget or boundary change is reviewed.
- `npm run ux:gate` in the Playwright container whenever the browser jobs run
  (and when `scripts/editor-ux/` or `docs/editor-ux/` change). It builds the web
  app, measures editor layout stability and edit latency in Chromium on desktop
  and mobile, and fails on any budget or exception-ceiling violation of
  `docs/editor-ux/editor-ux-contract.json`; the measurement is uploaded as the
  `editor-ux` artifact. See `docs/editor-ux/editor-ux-baseline.md` for how an
  intentional budget or exception change is reviewed.
- `npm run test:browser` in a browser-capable job with Chromium, Firefox, and
  WebKit installed. The suite includes desktop projects plus focused mobile
  Chromium/WebKit smoke.
- GitHub JavaScript actions should run with the Node 24 action runtime opt-in
  (`FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true`) so release checks do not carry
  the Node.js 20 action-runtime deprecation warning.
- Container images should be built only after the explicit container gate has
  confirmed the fast quality job, change detectors, and any required browser
  matrix. The image matrix must depend on that gate rather than combining
  matrix results and detector outputs in its own job-level condition.

## Branch And Release Flow

- `development` is the integration and release-candidate branch.
- A successful `CI` workflow on `development` triggers
  `.github/workflows/staging.yml`. The staging workflow deploys the exact CI
  revision to a dedicated Coolify application and a Vercel Preview build,
  verifies both revisions, and moves the stable staging alias only after the
  API passes. Manual runs can redeploy an older SHA only when it is still an
  ancestor of `development`. The job remains safely disabled until the
  repository variable `STAGING_ENABLED` is set to `true`.
- `main` is the production release branch. Production tags, GitHub Releases,
  and production deployments must use a reviewed commit already promoted from
  `development`.
- `.github/workflows/release.yml` is the manual production release workflow. It
  runs the release gate, verifies release metadata, and then can create a tag,
  manage a GitHub Release, or execute the gated production deployment depending
  on the selected action.
- The `production-release` GitHub Environment should require maintainer
  approval before any workflow action that creates tags, publishes releases,
  or changes production.
- `deploy-production` is the only intended production writer. It stages Vercel,
  pins Coolify to the production branch and verified commit, verifies the public
  API build SHA and contract, optionally runs a real AI smoke, then promotes the
  staged web deployment and verifies its reported build SHA. Automatic Vercel
  production deployments from `development` and `main` are disabled;
  pull-request previews remain enabled.
- Production deployments use a shared concurrency lock, so two versions cannot
  mutate Vercel or Coolify at the same time.
- Staging uses its own non-cancelling concurrency lock and a separate `staging`
  GitHub Environment. Staging and production credentials, stateful services,
  hostnames, and Coolify application UUIDs must not be shared. See
  [`deployment.md`](./deployment.md).
- The release Fallow gate blocks findings introduced by the release diff. Older
  findings remain in the report and are paid down separately; they are not
  hidden with inline suppressions.
- Until the web deployment is promoted, the new API briefly serves the previous
  web revision. API and database changes in this deployment path must therefore
  remain backward compatible for at least one web release.
- Pull requests remain the normal place to validate release candidates. Do not
  tag or publish a release from a dirty local worktree or from free-form notes.

## Manual QA

Record release evidence (commands, results, manual QA) in the Validation and
Manual QA sections of `docs/releases/vX.Y.Z.md`. Do not append per-release
evidence to this file. Older evidence lives in
[`archive/release-evidence.md`](./archive/release-evidence.md).

Run this checklist for every release and record the result in the release
notes.

### Core Editor

- Open `/app` with an empty/localStorage document.
- Randomize the cover several times.
- Add, hide, duplicate, rename, reorder, and delete layers.
- Verify layer visibility changes the rendered canvas.
- Save a `.artifact.json` file and reopen it.
- Save an editable `.artifact` project package and reopen it.
- For a package with imported fonts, confirm open-license Google font files can
  travel in the package, unknown local font files are not bundled by default,
  original text remains editable, and the font can be replaced if missing.
- Use `PKG+FONTS` only for an explicit all-font package export.
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
- Editable `.artifact` project packages preserve imported font metadata and
  original text. License-aware packages may include open-license Google font
  files; unknown local font files are not bundled by default. Missing fonts rely
  on fallback rendering until the user replaces the font.
- `CanvasHandles` still commits text/image transform movement through document updates during pointer moves.
- Projects and the pre-blank recovery copy are IndexedDB-backed local records.
  v0.34 keeps active project binding outside `CanvasDocument` so local
  `Save Project` can overwrite the active record while recovery remains an
  independent safety copy. Account-backed persistence, cross-device sync,
  project versions, and server-backed share records remain future work.

## Release Decision

For a public beta, prioritize reliability over breadth:

1. CI green.
2. Browser smoke green.
3. Manual QA checklist complete.
4. Known risks accepted in release notes.
5. No new full-stack feature is added before the local editor release is stable.
