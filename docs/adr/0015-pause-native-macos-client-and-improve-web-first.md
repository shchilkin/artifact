# Pause the native macOS client and improve Web first

Status: accepted. Decision date: 2026-09-29.

This pauses the direction recorded in ADR 0014, "Web and native macOS with a
shared Rust core", which lives on the native integration branch
(`codex/web-macos-integration`, draft PR #290) and has not been merged into
`development`.

## Context

The native client was motivated by two goals: a dependable offline base and a
fast, native-feeling editor in the spirit of Sketch rather than Figma.

Epic #260 turned that into 18 work packages for local 2D parity. The largest
cost is a second renderer: SwiftUI/CoreGraphics must re-implement all 66 effect
presets, graph utility nodes, text layout, and export, and keep matching the
Canvas 2D/PixiJS renderer within tolerances for every future effect. Even at
full parity the Mac client would exclude 3D, shader nodes, AI generation, and
cloud features, which are the current Web roadmap. While the native track was
active, `development` received no product merges for two months and v0.49/v0.50
stayed blocked.

Neither goal requires a native renderer. Editor speed depends on rendering
architecture, not on the host platform; Figma itself runs in the browser.
Offline use is reachable through the Web application.

## Decision

Pause epic #260 and its draft PRs (#283–#293). Keep their branches; do not
delete or merge them.

Work on the Web editor first, in this order:

1. v0.49 Application Shell And Loading Boundaries, starting with #238.
2. Editor performance on real projects, driven by measurements (render workers,
   `OffscreenCanvas`, render caching), not by platform changes.
3. Offline support through the Web application (PWA). A desktop wrapper such as
   Tauri may follow if file-system or Dock integration is needed.
4. v0.50 AI-Assisted Creation.

The shared Rust core is not adopted by the main Web editor as part of this
decision. It may be proposed again on its own merits with measured benefit to
Web users.

## Revisit when

- Web editor performance has been measured on representative projects and a
  remaining bottleneck cannot be solved inside the browser, or
- offline and desktop needs are not met by the PWA or a desktop wrapper, or
- distribution through the Mac App Store becomes a product requirement.

Any restart needs a new version plan that accounts for the permanent cost of
renderer parity.

## Consequences

The Web product moves again and keeps a single renderer, a single effect
pipeline, and the existing TypeScript command/history layer. Native progress
already made (parity contract, Rust command core, native render foundation)
remains available on its branches but will drift from `development` while
paused.
