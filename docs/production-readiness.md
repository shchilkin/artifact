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
npm run test:browser
```

Release notes are template-gated. Before committing a release, copy
`docs/release-template.md` to `docs/releases/vX.Y.Z.md` and fill every required
section. Do not create a tag or GitHub Release from free-form notes.

CI should run:

- `npm run release:verify` when package metadata, release notes, version plans,
  production readiness notes, or release workflow files change.
- `npm run check`
- `npm run build:ci`
- `npm run test:browser` in a browser-capable job with Chromium, Firefox, and
  WebKit installed. The suite includes desktop projects plus focused mobile
  Chromium/WebKit smoke.
- GitHub JavaScript actions should run with the Node 24 action runtime opt-in
  (`FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true`) so release checks do not carry
  the Node.js 20 action-runtime deprecation warning.

## Branch And Release Flow

- `development` is the integration and release-candidate branch.
- `main` is reserved as the future production release branch. Production tags
  and GitHub Releases should be created from `main` after the release candidate
  has passed review and has been promoted there.
- `.github/workflows/release.yml` is the manual production release workflow. It
  runs the release gate, verifies release metadata, and then can create a tag,
  create a draft GitHub Release, or publish an existing draft depending on the
  selected action.
- The `production-release` GitHub Environment should require maintainer
  approval before any workflow action that creates tags or publishes releases.
- Pull requests remain the normal place to validate release candidates. Do not
  tag or publish a release from a dirty local worktree or from free-form notes.

## Manual QA

### v0.34.0 Release Prep

- Release prep was approved by the maintainer on 2026-06-07 after local review
  confirmed the active project save workflow.
- v0.34 changes local Projects semantics from snapshot-only saving to active
  project binding outside `CanvasDocument` and adds `/projects` as a dedicated
  local workspace page.
- Package metadata is bumped to `0.34.0` in `package.json`,
  `apps/web/package.json`, and `package-lock.json`.
- `docs/releases/v0.34.0.md` is prepared from the release template without a
  visible internal checklist.
- Release metadata is now machine-checked by `npm run release:verify`, the
  release-metadata CI job, and the manual production release workflow.
- `npm run release:verify` passed on 2026-06-11.
- Manual QA confirmed: project save flow, active project state, disabled clean
  save state, copy behavior, Projects panel layout, and the dedicated Projects
  page are usable after the v0.34 polish pass.
- `npm run check` passed on 2026-06-07.
- `npm run build` passed on 2026-06-07.
- `npm run test:browser:release` passed on 2026-06-07 with `282 passed` and
  `25 skipped` across Chromium, Firefox, WebKit, mobile Chromium, and mobile
  WebKit.
- Fallow changed-file audit passed with zero dead-code findings, zero
  complexity findings, and zero duplicated lines.
- Focused post-release-file validation passed on 2026-06-07:
  `npm run format:check`, `npx tsc --noEmit --pretty false --project apps/web/tsconfig.json`,
  `npm --workspace @artifact/web run test -- app/utils/activeProjectBinding.test.ts app/utils/storageStatus.test.ts app/components/StorageWorkspaceStatus.test.ts`,
  and `npm run test:browser:chromium -- tests/browser/v033-storage.spec.ts`.
- Final v0.34 release action was confirmed by the maintainer on 2026-06-11.
- `npm run perf:node-editor` is not required for the current release-prep diff
  because v0.34 changes local project persistence semantics and Projects panel
  UI, not React Flow interaction, node-editor gesture paths, thumbnail
  scheduling, graph traversal, renderer/export behavior, document schema,
  package export, AI scope, or font-policy behavior.

### v0.33.0 Release Prep

- Package metadata is bumped to `0.33.0` in `package.json`,
  `apps/web/package.json`, and `package-lock.json`.
- `docs/releases/v0.33.0.md` is prepared from the release template without a
  visible internal checklist.
- v0.33 adds a Projects workspace status marker plus a Local Workspace summary
  for active snapshot state, browser storage estimate, recovery copy availability,
  offline-shell state, and browser capability warnings.
- v0.33 adds a conservative PWA slice: manifest, production-only service worker
  registration, static app-shell caching, and an offline navigation fallback.
- `npm run test:browser:release` is available for release prep and starts a
  fresh local browser-test server so stale dev servers do not masquerade as
  product failures.
- `npm run check` passed on 2026-06-06.
- `npm run build` passed on 2026-06-06.
- `npm run test:browser:release` passed on 2026-06-06 with `279 passed` and
  `25 skipped` across Chromium, Firefox, WebKit, mobile Chromium, and mobile
  WebKit.
- Fallow changed-file audit passed with zero dead-code findings, zero
  complexity findings, and zero duplicated lines.
- `npm run perf:node-editor` was not required because the final release-prep
  diff does not change React Flow interaction, node-editor gesture paths,
  thumbnail scheduling, graph traversal, document schema, package export, AI
  scope, font-policy behavior, or performance-sensitive canvas interaction
  code. The performance instrumentation helper was hardened so measurement
  failures cannot interrupt render or export flows.

### v0.32.0 Release Prep

- Release prep was approved by the maintainer on 2026-06-06 after local review
  confirmed the app works.
- Package metadata is bumped to `0.32.0` in `package.json`,
  `apps/web/package.json`, and `package-lock.json`.
- `docs/releases/v0.32.0.md` is prepared from the release template without a
  visible internal checklist.
- `docs/fallow-v0.32-health.md` records the v0.32 complexity review:
  health score `91.4`, zero functions above threshold, zero critical findings,
  zero high findings, and zero moderate findings.
- Fallow changed-code audit passed with `verdict: "pass"` and zero dead-code
  issues, zero complexity findings, and zero duplication clone groups.
- `npm run check` passed on 2026-06-06 with 54 web test files passing
  (`389 passed`) and 21 API test files passing (`93 passed`, `1 skipped`).
- `npm run build` passed on 2026-06-06.
- `npm run test:browser` passed on 2026-06-06 with `270 passed` and
  `25 skipped` across Chromium, Firefox, WebKit, mobile Chromium, and mobile
  WebKit. An earlier full browser run produced two timeout failures, but both
  failed scenarios passed when rerun directly before the final clean full gate.
- `npm run perf:node-editor` is not required for the current release-prep diff
  because no React Flow interaction, node-editor gesture, thumbnail scheduling,
  CSS behavior, graph traversal, renderer/export behavior, persistence format,
  document schema, AI scope, package export, or font-policy behavior changed.
- Full-health complexity is clean for v0.32. Making it a permanent strict
  release gate remains a future CI policy decision.

### v0.31.1 Release Prep

- Patch release prep passed locally on 2026-06-06.
- `npm run check`, `npm run build`, and `npm run test:browser` passed.
- Full browser coverage passed across Chromium, Firefox, WebKit, mobile
  Chromium, and mobile WebKit with `270 passed, 25 skipped`.
- Fallow changed-code audit passed with `verdict: "pass"` and zero dead-code
  issues, zero complexity findings, and zero duplication clone groups.
- PR #72 merged into `development` with all GitHub checks passing: `quality`,
  `fallow`, `browser`, container builds, Vercel, GitGuardian, and CodeRabbit.
- `v0.31.1` is the patch release for the final v0.31 Fallow cleanup, blocking
  Fallow CI state, static-OG decision, and release-notes cleanup.
- Public GitHub Release bodies should use `docs/releases/v0.31.1.md` without
  visible internal checklists. Operational checklist state stays in this
  production-readiness document and release-prep notes.
- `npm run perf:node-editor` was not rerun for the patch-only release commit
  because the patch release changes package metadata and documentation after the
  already-validated v0.31 cleanup merge.
- No renderer, graph traversal, export, persistence, document schema, landing,
  Showcase, How-to, AI scope, package export, or font-policy behavior changed
  as intended patch scope.
- Release notes live in `docs/releases/v0.31.1.md`.

### v0.31.0 Release Prep

- Release prep passed locally on 2026-06-05.
- `npm run check`, `npm run build`, and `npm run test:browser` passed.
- Full browser coverage passed across Chromium, Firefox, WebKit, mobile
  Chromium, and mobile WebKit with `270 passed, 25 skipped`.
- Fallow is integrated as a local and CI workflow. The CI job now runs the
  baseline report and blocks pull requests on the changed-code audit.
- The v0.31 Fallow baseline is captured in `docs/fallow-v0.31-baseline.md` and
  records both the initial report and the final zero-duplication cleanup result.
- The final Fallow report is clean: zero issues, zero duplicated lines, zero
  clone groups, zero clone instances, zero files with clones, and zero
  duplication percentage.
- The final changed-code audit returned `verdict: "pass"` with zero dead-code
  issues, zero complexity findings, and zero duplication clone groups.
- `npm run perf:node-editor` passed after rerunning outside the filesystem
  sandbox because the benchmark needs to bind `127.0.0.1:4174`. Node drag and
  graph pan had zero long tasks with p95 frame times around `17.5ms`; the effect
  slider had zero long tasks with p95 around `17.4ms`. Initial node-editor load
  still has startup long tasks and remains a future performance follow-up.
- No renderer, graph traversal, export, persistence, document schema, landing,
  Showcase, How-to, AI scope, package export, or font-policy behavior changed
  as intended release scope.
- Release notes live in `docs/releases/v0.31.0.md`.

### v0.30.0 Release Prep

- Release prep passed locally on 2026-06-04.
- `npm run check`, `npm run build`, `npm run test:browser`, and
  `npm run perf:node-editor` passed.
- Full browser coverage passed across Chromium, Firefox, WebKit, mobile
  Chromium, and mobile WebKit with `276 passed, 19 skipped`.
- Focused v0.30 visual coverage verifies blank editor, style-guide route,
  Layers Add Library, layer selected/hidden/locked states, node output-path
  state, graph area context, and readable shared primitives.
- Focused export smoke verifies the default document still downloads from the
  canonical browser export action.
- Shared primitives read from Artifact tokens and remain source-owned under
  `apps/web/app/components/ui/*`; Radix/shadcn mechanics do not import default
  visual styling as the product shell.
- `npm run perf:node-editor` confirmed drag and pan interaction scenarios with
  zero long tasks and p95 frame times around `17ms`; the effect slider had one
  `79ms` long task. Initial node-editor load remains a future performance risk.
- Local perf runs without Clerk configuration still report missing publishable
  key warnings, but the benchmark completes and editor interactions remain
  usable.
- No renderer, graph traversal, export, persistence, document schema, landing,
  Showcase, or How-to behavior changed as intended release scope.
- Release notes live in `docs/releases/v0.30.0.md`.

### v0.28.0 Release Prep

- Released as the public Editor Guardrails v2 release after v0.27.
- User verified the v0.28 editor guardrails workflow locally before release
  prep.
- Automated release gate passed on 2026-05-28.
- `npm run format:check`, `npm run check`, `npm run build`, and
  `npm run test:browser` passed during implementation and release prep.
- Full browser coverage passed across Chromium, Firefox, WebKit, mobile
  Chromium, and mobile WebKit with `237 passed, 19 skipped`.
- PR validation for the implementation branch passed quality, browser,
  GitGuardian, Vercel, Vercel Preview Comments, and CodeRabbit checks before
  merge.
- `npm run perf:node-editor` was not required because the release does not
  change React Flow wiring, thumbnail scheduling, node preview rendering, or
  high-frequency gestures.
- Release notes live in `docs/releases/v0.28.0.md`.

### v0.27.0 Release Prep

- Released as the cumulative public editor release for the already-merged v0.26
  Layer Mode Polish work and the v0.27 Editor Confidence and Coverage work.
- User verified the v0.27 editor confidence and layer reorder behavior locally
  before release prep.
- Automated release gate passed on 2026-05-28.
- `npm run check`, `npm run build`, and `npm run test:browser` passed.
- Full browser coverage passed across Chromium, Firefox, WebKit, mobile
  Chromium, and mobile WebKit with `234 passed, 19 skipped`.
- Coverage baseline commands passed with `npm run test:coverage:web` and
  `npm run test:coverage:api`.
- `npm run perf:node-editor` passed during v0.27 validation after rerunning
  outside the filesystem sandbox because the benchmark needs to bind a local
  preview server.
- Release notes live in `docs/releases/v0.27.0.md`.

### v0.26.0 Release Prep (Rolled Into v0.27.0)

- Validate the Layers workflow from empty document to export.
- Confirm Layers Add Library search, category filtering, hover preview, and
  click-to-add behavior remain consistent with the shared Add Library model.
- Confirm Fill, Image, Text, and AI Image previews represent their source type.
- Confirm selected, hidden/muted, drag-over, and focused layer-row states remain
  readable in the dark editor.
- Confirm layer row actions still work: select, rename, duplicate, hide/show,
  reorder, delete, and add effect/source.
- Confirm quick slider/control edits keep the visible final preview responsive.
- Confirm Layers -> Nodes -> Layers keeps the visible preview nonblank.
- Confirm stack export and graph-backed export still match the visible preview.
- Confirm no document schema migration, graph traversal change, render/export
  semantic change, thumbnail scheduling change, AI scope change, or package/font
  policy change is introduced.

### v0.25.0 Release Prep

- Released as `v0.25.0` on 2026-05-27:
  https://github.com/shchilkin/artifact/releases/tag/v0.25.0
- User verified the v0.25 Google font and package policy workflow locally on
  2026-05-27.
- Automated release gate passed on 2026-05-27.
- `npm run check`, `npm run build`, and `npm run test:browser` passed.
- Full browser coverage passed across Chromium, Firefox, WebKit, mobile
  Chromium, and mobile WebKit with `210 passed, 19 skipped`.
- Validate Google Fonts import by family name and by CSS2 URL from the Font
  Library.
- Confirm imported Google fonts render in Layers and Nodes, survive project
  package roundtrip, and remain editable as text.
- Confirm regular `PACKAGE` export includes open-license Google font files with
  source/license metadata, while unknown local font files remain metadata-only.
- Confirm `PKG+FONTS` includes all imported font files only through the explicit
  user action.
- Confirm raster `EXPORT` remains pixel-only and includes no font files.
- Release notes live in `docs/releases/v0.25.0.md`.

### v0.24.0 Release Prep

- User verified the v0.24 project package flow locally on 2026-05-26.
- Automated release gate passed on 2026-05-26.
- `npm run check`, `npm run build`, and `npm run test:browser` passed.
- Full browser coverage passed across Chromium, Firefox, WebKit, mobile
  Chromium, and mobile WebKit with `209 passed, 17 skipped`.
- Editable `.artifact` project packages were validated for stack documents,
  graph documents with output nodes, imported image payloads, imported font
  metadata without bundled unknown font files, and missing-font replacement.
- Raster artwork export remains pixel-only; unknown imported font files are not
  silently redistributed in editable project packages.
- Release notes live in `docs/releases/v0.24.0.md`.

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
- Asset library for uploaded images, generated images, cutouts, reusable
  textures, and exported outputs.
- Export presets/history for music targets, social formats, transparent PNGs,
  posters, and print output.
- Active project save/overwrite behavior plus project versions and named creative snapshots with duplicate, restore, and
  compare flows.
- Autosave/recovery status, project-size visibility, storage cleanup, and
  unused-asset deletion flows.
- Browser capability warnings for unsupported WebGL, storage, or file APIs.
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
- AI licensing, usage-rights, moderation, prompt privacy, abuse controls,
  provider fallback, and generation cost visibility.
- Server-side asset storage for large uploads.
- Server-side asset library and local-to-cloud asset sync.
- Read-only, remix/fork, export-only, and later collaboration share modes.
- Team/project collaboration.

## Release Decision

For a public beta, prioritize reliability over breadth:

1. CI green.
2. Browser smoke green.
3. Manual QA checklist complete.
4. Known risks accepted in release notes.
5. No new full-stack feature is added before the local editor release is stable.
