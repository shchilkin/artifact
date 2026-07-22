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

### v0.42.0 Release Prep And Evidence

- Package metadata is bumped to `0.42.0` in `package.json`,
  `apps/web/package.json`, `apps/backoffice/package.json`, and
  `package-lock.json`.
- `docs/releases/v0.42.0.md` is prepared from the release template without a
  visible internal checklist.
- v0.42 adds the internal source-owned `@artifact/ui` workspace, one semantic
  Theme Contract, distinct Artifact and Backoffice Product Themes, and their
  shared Artifact Brand Signature.
- The accepted v1 Foundation primitives are shown through the same
  package-owned Foundation Matrix in Artifact `/docs/style-guide` and
  Backoffice `/style-guide`.
- The existing Artifact AI Generation composer and Backoffice sign-in are the
  two proof consumers; AI Chat capability and broad UI migration remain
  deferred.
- Clean-base validation passed on 2026-07-22: release verification, formatting,
  lint, type checking, 25 deployment tests, 20 UI Foundation tests, 677 Web
  tests, 261 passing API tests with 5 skipped, 9 Backoffice tests, and both Web
  and Backoffice production builds.
- The full browser release gate completed with 406 passed and 49 intentionally
  skipped tests across Artifact Chromium, Firefox, WebKit, mobile Chromium,
  mobile WebKit, and Backoffice desktop/mobile Chromium.
- One Chromium GLB/EXR clean-context test used its available retry because its
  helper still opened hard-coded port `4173` while the isolated gate ran on
  `4174`. After the helper was bound to Playwright's configured `baseURL`, that
  scenario passed 1/1 with retries disabled.
- The build retains 11 existing Fast Refresh warnings and the existing large
  Three.js vendor-chunk warning; neither is introduced by v0.42.
- `npm run perf:node-editor` is not required because v0.42 does not change
  graph traversal, rendering, thumbnail scheduling, or node-canvas hot paths.
- Accepted release risk: most surfaces still use local or legacy CSS and are
  intentionally split across v0.43-v0.48.
- Accepted release risk: compatibility wrappers and compatible selectors remain
  until the v0.48 zero-caller conformance gate.
- Accepted release risk: the conformance gate is not a full visual-regression
  suite or complete WCAG certification.
- Accepted release risk: `@artifact/ui` is an internal source-consumed
  workspace, not a published public package.
- PR #204 merged the completed release candidate into `development` as
  `b7bd23c1e9114a4e53b1360f0c7eed9b90ffb8b2`. Post-merge CI run `29931759354`
  and exact-SHA staging run `29934035680` passed before the stable staging
  surfaces moved to that revision.
- Promotion PR #205 passed CI run `29934375688` and merged the verified tree
  into `main` as production commit
  `1380d98fa6f748a008bd353a6a523fa370fadb8b`.
- Release run `29936331375` passed the full gate and created annotated tag
  `v0.42.0` plus the draft GitHub Release. Production run `29937964396` repeated
  the full gate, verified the staged Vercel deployment, deployed and verified
  the Coolify/API revision and contract version 1, promoted the web deployment,
  and verified the production web domain reported the same commit.
- Publish run `29939502145` passed the final full gate and published `v0.42.0`
  as the latest release on 2026-07-22. All seven delivery issues and milestone
  #4 are closed.

### v0.41.3 Release Prep And Evidence

- Package metadata is bumped to `0.41.3` in the root, web, backoffice, and lock
  files.
- `docs/releases/v0.41.3.md` is prepared from the release template.
- PR #199 restored the `development` product tree to the post-v0.41.2 baseline
  plus the model-drop fix. The release candidate contains no `packages/runtime`
  directory, `@artifact/runtime` workspace, lockfile entry, or Runtime build
  wiring.
- Model drops in Nodes retain the pointer position and no longer rebuild the
  existing graph as a linear layer stack.
- Focused Chromium coverage records the existing graph edges and positions,
  drops a minimal GLB, and verifies the old graph is unchanged while the new
  model appears near the drop point.
- `npm run release:verify`, `npm run check`, `npm run build`, and
  `npm run test:browser:release` passed locally on 2026-07-21. The browser gate
  completed with 364 passed and 47 skipped tests. The focused 3D Chromium file
  passed all 11 tests on a clean rerun after one cold-start duplicate-React
  diagnostic in the existing render/export smoke.
- Earlier staging run `29856189068` verified the isolated candidate Vercel
  build but stopped safely before changing the stable alias because Coolify
  followed the then-newer `development` tip. PR #199 removed that tree
  divergence. PR #200 then merged release candidate
  `228ca86c172101006f4c96f9ecf0d642f159051f` into `development`; CI run
  `29864747932` and exact-SHA staging run `29865477926` passed before the stable
  staging alias moved.
- Promotion PR #201 merged the candidate into `main` as production commit
  `099cd87fac427cc37c101b9dfd20ce209d7def7c`. The tagged tree was rechecked
  without `packages/runtime`, an `@artifact/runtime` workspace or dependency,
  Runtime lockfile entries, or Runtime build wiring.
- Release run `29867015440` passed the full gate and created annotated tag
  `v0.41.3` plus the draft GitHub Release. Production run `29868440803` repeated
  the full gate, verified the staged web deployment, Coolify/API revision and
  contract version 1, promoted the web deployment, and verified both production
  surfaces reported the exact production commit. Publish run `29869952126`
  passed the final full gate and published `v0.41.3` as the latest release on
  2026-07-21.
- `npm run perf:node-editor` is not required because the patch changes the
  completed model-drop command, not per-frame dragging, graph traversal,
  rendering, or thumbnail scheduling.
- Accepted release risk: layouts already rewritten and saved by an older
  version cannot be reconstructed automatically.
- Accepted release risk: `npm ci` reports 15 inherited dependency advisories
  (3 low, 3 moderate, and 9 high). The patch changes no dependencies and keeps
  remediation in the existing dedicated maintenance track.

### v0.41.2 Release Prep

- Package metadata is bumped to `0.41.2` in the root, web, backoffice, and lock
  files.
- `docs/releases/v0.41.2.md` is prepared from the release template.
- A legacy package whose GLB bytes were never embedded now reports `Model asset
  missing`; invalid GLB data continues to report `Model load failed`.
- The model inspector can store a replacement GLB under a new stable
  `artifact-model://` reference while preserving the existing model layer ID,
  graph connections, and scene settings.
- Focused Chromium coverage imports a package with empty browser storage,
  confirms the missing state, reattaches a valid GLB, resolves it from
  IndexedDB, and waits for a rendered model frame.
- The existing v0.41.1 GLB/EXR export-to-clean-context regression remains in
  the release browser gate.
- `npm run check`, `npm run build`, and `npm run test:browser:release` passed
  locally on 2026-07-19. The browser gate completed with 363 passed and 45
  skipped tests.
- The merged `development` revision
  `29716f3f6c61d05e594c67f8be5ac900b96c44c3` passed CI run `29695020188`. One
  unrelated WebKit editor-startup flake passed when the failed job was rerun
  without a code change. The final release-candidate revision
  `964f27cc47b82bb1f3c835ff26af47a6c85c0f0b` passed CI run `29696591528` and
  exact-SHA staging run `29696846674`.
- The Fallow changed-code gate passes with no introduced dead code, complexity
  findings, or clone groups. Inherited findings remain visible for separate
  trace-backed cleanup.
- `npm run perf:node-editor` is not required because the patch does not change
  graph traversal, rendering algorithms, thumbnail scheduling, or hot gesture
  paths.
- Accepted release risk: packages that never contained the GLB still require
  the original file once; absent bytes cannot be reconstructed.
- Accepted release risk: the reported `skull.glb` itself was not available for
  parser testing. The recovery regression uses a valid minimal GLB, so any
  model-specific extension or decoder issue requires the original asset.
- Promotion PR #193 merged `development` to `main` as production commit
  `fec4393521417b4799c665ab767a8c61b3bd9c56` after the full CI matrix passed.
- Release run `29698295659` passed metadata, quality, build, full browser, and
  Fallow gates before creating tag `v0.41.2` and the draft GitHub Release. The
  tag dereferences to the production commit above.
- Production run `29698861299` repeated the full release gate, verified staged
  Vercel deployment `artifact-6s4s0viv7-shchilkins-projects.vercel.app`,
  completed Coolify deployment `j7olbao4asw34f5y7x6luhy7` from the same SHA,
  verified API contract version 1 and the exact API revision, promoted the web
  deployment, and verified the production web domain returned that exact SHA.
- The release browser gate retained the Chromium export -> empty browser
  context -> import -> IndexedDB resolution -> rendered 3D Scene regression
  for embedded GLB and EXR payloads, alongside the missing-model and in-place
  replacement regressions added in v0.41.2.
- Publication run `29699554852` passed the full release gate again and published
  `v0.41.2` as the latest GitHub Release on 2026-07-19.

### v0.41.1 Release Prep

- Package metadata is bumped to `0.41.1` in `package.json`, web/backoffice
  package metadata, and `package-lock.json`.
- `docs/releases/v0.41.1.md` is prepared from the release template without a
  visible internal checklist.
- The patch embeds imported GLB/GLTF and HDR/EXR payloads in editable `.artifact`
  packages, records their manifest metadata, and restores stable refs in a
  clean browser storage context.
- Legacy package format v1/document schema v3 files without embedded 3D
  payloads remain importable and retain unresolved refs for the existing model
  and environment missing-asset states.
- Focused unit and Chromium clean-context round-trip coverage passed, including
  a manual round trip with a 2.9 MB GLB and 6.1 MB EXR.
- The full release browser gate passed on 2026-07-19 with 354 passed and 47
  skipped tests across Chromium, Firefox, WebKit, mobile Chromium, and mobile
  WebKit. Quality, type, format, build, release metadata, and changed-code
  Fallow gates passed.
- The exact `development` release-candidate SHA passed staging web/API revision
  and contract verification before the stable staging alias moved.
- Tag `v0.41.1` resolves to production commit
  `355c15602178bcdcdf7d1c685e676a53dd4f2c32`. The coordinated production
  deployment verified that exact web and API revision before promoting the web
  domain.
- A public production-origin Chromium smoke exported the embedded GLB/EXR
  package, imported it in a second browser context with empty storage, resolved
  both stable asset refs from restored IndexedDB payloads, and rendered the 3D
  Scene without model or environment fallback.
- The GitHub Release was published on 2026-07-19 after production verification.
- `npm run perf:node-editor` is not required because this patch changes package
  persistence boundaries and does not change graph traversal, thumbnail
  scheduling, renderer hot paths, or node-canvas interactions.
- Accepted release risk: already-exported packages that omitted GLB/EXR bytes
  cannot reconstruct those absent payloads; users must reopen a source browser
  store or choose the original files once before exporting a corrected package.
### v0.41.0 Release Prep

- Package metadata is bumped to `0.41.0` in `package.json`,
  `apps/web/package.json`, and `package-lock.json`.
- `docs/releases/v0.41.0.md` is prepared from the release template without a
  visible internal checklist.
- v0.41 adds explicit Free, Creator, and Founder tiers, atomic cross-feature AI
  operation accounting, audited quota grants, provider-cost attribution, and a
  global Safety Budget.
- v0.41 adds the separate admin-only backoffice, Better Auth role enforcement,
  account and usage views, tier/quota controls, audit metadata, and no access to
  prompts, generated assets, shader source, or project documents.
- v0.41 adds one manual release workflow that gates the exact commit, stages
  Vercel, pins Coolify to the same SHA, verifies the public API revision and AI
  contract, and only then promotes the web deployment.
- Production QA confirmed the backoffice domain and TLS, trusted origin/CORS
  behavior, signed-out and Admin flows, account list/detail views, Founder
  assignment, tier/quota controls, and Bull Board visibility.
- `npm run check` passed: deploy tests 16 passed, web tests 674 passed, API
  tests 261 passed with 5 skipped, plus lint, formatting, and type checks.
- `npm run build` passed for the web and backoffice applications.
- `npm run test:browser:release` passed with 357 passed and 39 skipped tests
  across Chromium, Firefox, WebKit, mobile Chromium, and mobile WebKit.
- `npm run test:e2e:backoffice:run` passed with 18 passed and 2 skipped tests.
- `npm run perf:node-editor` is not required because v0.41 does not change graph
  traversal, rendering, thumbnail scheduling, or node-canvas hot paths.
- Accepted release risk: Cloudflare Access is deferred. Every backoffice data
  read and mutation still requires Better Auth Admin authorization.
- Accepted release risk: the backoffice remains a React Router SPA. SSR needs a
  separate Node runtime, cookie-forwarding review, hydration tests, and rollback
  boundary.
- Accepted release risk: provider reconciliation has a daily import and a
  server-only manual CLI; an audited Admin UI/API trigger remains follow-up.
- Accepted release risk: legacy entitlement columns remain for rollback
  compatibility but no longer influence access decisions. Their removal is a
  verified follow-up migration.
- Accepted release risk: Coolify still builds exact verified source revisions;
  immutable images and digest-only deployment remain follow-up infrastructure
  work.
- Accepted release risk: `npm audit` reports 14 dependency advisories. A
  dedicated post-release remediation pass is recorded in the roadmap without
  adding suppressions.
- Accepted release risk: four transient browser scenarios passed on retry in
  the full release matrix. They remain visible in the gate rather than being
  hidden or ignored.

### v0.40.0 Release Prep

- Package metadata is bumped to `0.40.0` in `package.json`,
  `apps/web/package.json`, and `package-lock.json`.
- `docs/releases/v0.40.0.md` is prepared from the release template without a
  visible internal checklist.
- v0.40 adds explicit Shader Fill and Shader Effect roles, definition-backed
  Code Shader and AI Shader nodes, ordered palettes, dynamic controls, and
  transparent empty/error output.
- AI Shader generation uses authenticated OpenAI requests, browser acceptance,
  one repair path, owner-scoped refinement, durable provenance/idempotency, and
  an explicitly chosen labeled local fallback.
- Code Shader compilation and WebGL failures stay contained; empty and failed
  shaders remain transparent instead of destabilizing the graph or output.
- Manual QA confirmed Shader Fill/Effect connections, Code Shader diagnostics,
  AI create/validate/refine/fallback states, generated controls, and preservation
  of the previous accepted result during replacement.
- Manual QA confirmed the local AI launcher skips ports occupied through IPv4
  or IPv6 before running its API health and contract checks.
- `npm run release:verify` passed on 2026-07-11.
- `npm run check` passed on 2026-07-11 with 11 existing Fast Refresh lint
  warnings, 663 web tests passing, and 171 API tests passing with 2 skipped.
- `npm run build` passed on 2026-07-11. The build still reports the existing
  large `three-vendor` chunk, accepted for current 3D paths.
- The segmented browser matrix completed on 2026-07-11 with `355 passed` and
  `38 skipped` across Chromium, Firefox, WebKit, mobile Chromium, and mobile
  WebKit. No failed test required its available retry in the final release run;
  the existing 3D preview timeout fallback was observed without failing its
  render/export coverage.
- `npm run perf:node-editor` passed on 2026-07-11 because v0.40 changes node
  inspectors, thumbnails, graph rendering, and output behavior.
- Accepted release risk: shader animation, timeline control, animated
  thumbnails, and video/sequence export remain deferred until time ownership
  and performance budgets are explicit.
- Accepted release risk: custom and AI Shader Definitions remain embedded in
  project documents; reusable preset storage, definition history/versioning,
  marketplace, and community sharing remain future work.
- Accepted release risk: AI Shader availability depends on provider access and
  quota. Local drafts are deliberately limited, labeled, and require explicit
  user choice after a recoverable provider failure.
- Accepted release risk: long local WebGL browser runs can expose startup
  flakes. The release runner isolates groups across fresh dev servers and keeps
  one retry visible in Playwright output.

### v0.39.0 Release Prep

- Package metadata is bumped to `0.39.0` in `package.json`,
  `apps/web/package.json`, and `package-lock.json`.
- `docs/releases/v0.39.0.md` is prepared from the release template without a
  visible internal checklist.
- v0.39 replaces Clerk with Better Auth for account sign-up, sign-in, session
  loading, sign-out, and account-backed project access.
- v0.39 adds password recovery through Resend-backed reset emails and a
  dedicated reset-password route.
- v0.39 adds cloud project saves, project API routes, cloud asset upload routes,
  and client-side project reassembly so large image/font/model/environment
  payloads can sync outside the compact project manifest.
- v0.39 hardens production API deploys with startup migrations, Coolify
  healthchecks, Vercel preview API origin support, and Redis persistence
  configuration fixes.
- v0.39 clarifies Projects sync state for local-only, cloud-only, synced,
  syncing, failed, and too-large projects while preserving local Projects and
  recovery drafts.
- Manual QA confirmed account creation, sign-in, sign-out, password reset email
  delivery, local-to-cloud project behavior, large asset-backed project loading,
  production API logs, and Coolify health during the auth/cloud-save debugging
  pass.
- `npm run release:verify` passed on 2026-07-01.
- `npm run check` passed on 2026-07-01 with 11 existing Fast Refresh lint
  warnings, 511 web tests passing, and 123 API tests passing with 2 skipped.
- `npm run build` passed on 2026-07-01. The build still reports large
  `three-vendor` and `pixi-vendor` chunks, which remain accepted for the
  current 3D/Pixi editor paths.
- `npm run test:browser` passed on 2026-07-01 with `340 passed` and
  `38 skipped` across Chromium, Firefox, WebKit, mobile Chromium, and mobile
  WebKit. An earlier local full browser run exposed transient dev-server route
  loading and Firefox `@vite/client` HMR noise; targeted reruns passed and the
  final full browser gate passed cleanly.
- `npm run perf:node-editor` is not required for the v0.39 release-prep diff
  because the release changes account-backed persistence, API deploy behavior,
  project asset sync, and Projects/status UI rather than React Flow gesture
  paths, graph traversal, thumbnail scheduling, renderer/export behavior, or
  performance-sensitive node-editor interactions.
- Accepted release risk: public share links, sharing permissions, ownership
  transfer, and collaboration remain future work; cloud projects are private
  account saves in this release.
- Accepted release risk: cloud assets remain on the initial server storage path
  instead of S3-compatible object storage; quotas, cleanup, deduplication, and
  storage billing policy remain future work.
- Accepted release risk: project history, autosave versions, restore/compare,
  and explicit cloud/local conflict resolution remain deferred.

### v0.38.0 Release Prep

- Package metadata is bumped to `0.38.0` in `package.json`,
  `apps/web/package.json`, and `package-lock.json`.
- `docs/releases/v0.38.0.md` is prepared from the release template without a
  visible internal checklist.
- v0.38 polishes the editor-first `/app` chrome, Layers and Nodes controls,
  responsive bottom actions, layer rows, node handles, context menus, and local
  project/share/open action clarity.
- v0.38 stages `.artifact.json` and editable package files before replacing the
  current document, saves the current canvas as a recovery copy, and asks users
  to confirm artifact-file replacement.
- v0.38 refreshes the app glyph, favicon, manifest icon, shared dropdown/action
  primitives, and internal style-guide examples while keeping the broader public
  site identity out of scope.
- v0.38 includes the already-merged Bad Stream block effect follow-up from
  PR #79 without turning the release into a broad effect batch.
- Manual QA confirmed Layers and Nodes at desktop and narrow widths, aspect
  menu behavior, Add menus, row context menus, node toolbar grouping, pan/zoom,
  edge-drop menus, output-path controls, metrics overlay behavior, resource
  drops, artifact replacement confirmation, and nonblank export actions.
- `npm run check` passed on 2026-06-23.
- `npm run build` passed on 2026-06-23.
- `npm run test:browser` passed on 2026-06-23 with `331 passed` and
  `38 skipped` across Chromium, Firefox, WebKit, mobile Chromium, and mobile
  WebKit.
- `npm run perf:node-editor` passed on 2026-06-23 because v0.38 changes React
  Flow chrome, node handles, node menus, bottom actions, thumbnails, and
  performance overlay surfaces.
- `npm run release:verify` passed on 2026-06-23.
- Accepted release risk: the public landing page and broader brand/site refresh
  remain future work; v0.38 intentionally ships the editor-first identity and
  chrome pass.
- Accepted release risk: project autosave history, project versions,
  restore/compare, and cloud share links remain deferred so the local project
  model can stay simple in this release.
- Accepted release risk: the full browser suite remains a large single-worker
  cross-browser gate. Continued suite stability and CI runtime work remain
  useful, but v0.38 ships with a clean final browser pass.

### v0.37.0 Release Prep

- Package metadata is bumped to `0.37.0` in `package.json`,
  `apps/web/package.json`, and `package-lock.json`.
- `docs/releases/v0.37.0.md` is prepared from the release template without a
  visible internal checklist.
- v0.37 adds one graph-native PBR Material node with scalar controls and
  albedo, roughness, metalness, normal, and alpha texture-map inputs.
- v0.37 adds explicit material ports for 3D primitive and 3D Scene workflows,
  plus Environment Map nodes that can light and reflect in scenes instead of
  acting only as flat backdrops.
- v0.37 keeps material nodes graph-only while Layers continue to expose 3D
  material controls as settings on primitive/model/scene surfaces.
- v0.37 defers Three.js viewport and renderer loading for blank editor and
  non-3D Nodes workflows. A production network smoke on
  `http://127.0.0.1:4180/app?new=blank` confirmed no `three-vendor` or 3D
  viewport/renderer chunks were requested before a 3D surface was needed.
- Manual QA confirmed material-node creation from Add Library, material
  inspector controls, connected 3D Scene material input behavior, environment
  lighting/reflection behavior, downstream graph composition, and raster export
  parity.
- `npm run check` passed on 2026-06-20.
- `npm run build` passed on 2026-06-20. The build still reports a large
  `three-vendor` chunk, which remains accepted for the ongoing 3D work.
- `npm run test:browser:release` passed on 2026-06-20 with `300 passed` and
  `37 skipped` across Chromium, Firefox, WebKit, mobile Chromium, and mobile
  WebKit.
- Focused validation passed on 2026-06-20:
  `npm --workspace @artifact/web run test -- app/utils/modelRenderer.test.ts app/test-fixtures/render/graphRender.test.ts` and
  `npm run test:browser:chromium -- tests/browser/v036-3d-model-retro.spec.ts`.
- `npm run perf:node-editor` passed on 2026-06-20 because v0.37 changes
  React Flow nodes, graph signatures, thumbnails, and WebGL-heavy material
  preview paths. Dragging, slider changes, and graph panning stayed around
  17ms p95 with zero long tasks during interactions; initial node-editor load
  still has thumbnail/render/GPU startup long tasks and remains a performance
  follow-up, but Three.js is no longer downloaded or evaluated on the non-3D
  startup path.
- `npm run release:verify` passed on 2026-06-20.
- Accepted release risk: PBR material authoring starts with one graph material
  node and scalar/map inputs; deeper map scale/rotation, channel packing, and
  larger material examples remain future polish.
- Accepted release risk: heavy 3D material browser coverage remains
  Chromium-first while the full browser suite continues to cover the app across
  Firefox, WebKit, and mobile projects.
- Accepted release risk: `three-vendor` remains large when a 3D surface is
  actually used; further Three.js loader splitting and 3D prefetch policy remain
  future performance polish.

### v0.36.0 Release Prep

- Package metadata is bumped to `0.36.0` in `package.json`,
  `apps/web/package.json`, and `package-lock.json`.
- `docs/releases/v0.36.0.md` is prepared from the release template without a
  visible internal checklist.
- v0.36 adds 3D Model and Environment graph inputs, a 3D Scene rendering path,
  scene-owned model framing, lighting/environment controls, and retro finishing
  effects for indexed palettes, dot grain, alpha crush, silhouette crush, and
  edge crush.
- v0.36 updates Layers semantics so 3D Scene is the layer target while 3D Model
  and Environment are presented as scene settings there; Nodes keeps the 3D
  Model, Environment, and 3D Scene nodes explicit.
- Manual QA confirmed GLB model import, scene camera movement, model rotation
  and positioning, environment/backdrop inputs, retro effect stacks,
  preview/export parity, and always-spinning 3D Model input previews that do
  not write to undo/history.
- `npm run check` passed on 2026-06-16 with 12 existing lint warnings, 462 web
  tests passing, and 93 API tests passing with 1 skipped.
- `npm run build` passed on 2026-06-16. The build still reports a large
  `three-vendor` chunk, which is accepted for this first 3D release.
- `npm run test:browser:release` passed on 2026-06-16 with `296 passed` and
  `35 skipped` across Chromium, Firefox, WebKit, mobile Chromium, and mobile
  WebKit. A second full release run exposed unrelated browser-suite flakes; a
  third full release run passed again with `296 passed` and `35 skipped`.
- Focused browser validation passed on 2026-06-16:
  `npm run test:browser:chromium -- tests/browser/generator.spec.ts --grep "AI image node appends history"` and
  `npm run test:browser:chromium -- tests/browser/v036-3d-model-retro.spec.ts`.
- `npm run perf:node-editor` passed on 2026-06-16 because v0.36 changes
  React Flow nodes, 3D thumbnails, render signatures, scene rendering, and
  export-sensitive behavior. Dragging, slider changes, and graph panning stayed
  around 16-17ms p95 with zero long tasks during interactions; initial
  node-editor load still has startup long tasks and remains a performance
  follow-up.
- `npm run release:verify` passed on 2026-06-16.
- Accepted release risk: GLB/GLTF is the first-class model import path; OBJ and
  deeper material editing remain future polish because they need separate
  material/texture handling.
- Accepted release risk: WebGL-heavy v0.36 browser coverage is Chromium-first;
  Firefox and WebKit keep lightweight unsupported-drop coverage for this
  release.

### v0.35.0 Release Prep

- Package metadata is bumped to `0.35.0` in `package.json`,
  `apps/web/package.json`, and `package-lock.json`.
- `docs/releases/v0.35.0.md` is prepared from the release template without a
  visible internal checklist.
- v0.35 adds Mask, Transform, and Grime Shadow graph utility nodes, Line Field
  source layers, and deterministic per-copy Repeat rotation while keeping cloud
  sharing, project history, asset-library work, and broad effect-batch work out
  of scope.
- v0.35 updates Add Library search, node docs, starter recipes, graph
  traversal, render signatures, thumbnails, gallery, and export behavior for
  the new graph/source nodes.
- Manual QA confirmed masked branch composition, post-mask movement and
  rotation, dirty alpha shadow layering, Line Field source search and controls,
  and repeated rotated motif workflows.
- `npm run check` passed on 2026-06-13.
- `npm run build` passed on 2026-06-13.
- `npm run test:browser:release` passed on 2026-06-13 with `288 passed` and
  `25 skipped` across Chromium, Firefox, WebKit, mobile Chromium, and mobile
  WebKit.
- Focused browser validation passed on 2026-06-13:
  `npm run test:browser:release -- --grep "v0.35 graph nodes"` and
  `npm run test:browser:release -- --project=webkit --grep "docs research page supports search and type filtering"`.
- `npm run release:verify` passed on 2026-06-13.
- `npm run perf:node-editor` passed on 2026-06-13 because v0.35 changes graph
  nodes, React Flow node behavior, graph traversal, thumbnails, and
  render/export paths.
- Accepted release risk: Line Field is a procedural source with distortion
  controls, not an arbitrary vector-field editor or hand-painted displacement
  system.

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
  and `npm run test:browser:chromium -- tests/browser/projects-storage.spec.ts`.
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
