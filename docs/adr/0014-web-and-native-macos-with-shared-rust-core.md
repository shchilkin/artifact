# Web and native macOS with a shared Rust core

Status: accepted architectural direction; document-command pilot implemented locally.
Native Viber preview/export and shared CPU effect kernels are implemented;
Minor noise/effect differences are accepted for the Viber pilot. The local
Web -> Mac -> Web open/edit/save/PNG workflow is verified. General editor
coverage and performance budgets remain open; see the pilot evidence.
Decision date: 2026-09-23.

## Decision and scope

Artifact will target two editor clients in this monorepo:

- Web: retain the React application and its browser workflows.
- macOS: build a native SwiftUI application, using AppKit where needed for
  document, window, input, and rendering integration.

Shared platform-independent editor logic will move incrementally into Rust.
The web client will consume a WebAssembly build; macOS will consume a native
library built from the same Rust sources. Native macOS means a native client,
not a Tauri/Electron wrapper around the existing web editor.

iOS, iPadOS, Android, Windows, and Linux applications are outside this scope.
Portability is useful, but this decision does not create clients, adapters,
build targets, or a test matrix for those platforms. Existing web browser
support remains unchanged.

This is a separate architecture track, not an addition to the accepted
v0.49/v0.50 release scope. Implementation slices need their own acceptance
criteria and validation under [Version Planning](../version-planning.md).
No release number or delivery date is assigned here.

Epic #260 scopes local 2D parity; its [P01 contract](../native-2d-parity-contract.md)
and [capability inventory](../native-2d-capabilities.json) pin the main Web
reference, ownership, synthetic fixtures, tolerances and target budgets.
Later implementation issues require a recorded integrated foundation SHA or
an explicitly approved stacked base. This does not change existing milestones.

## Ownership boundaries

The target Rust core owns document validation and migrations, durable editing
commands, undo/redo semantics, graph rules and evaluation order, and portable
procedural calculations. Preserve the existing `CanvasDocument` meaning and
portable project formats; changing the implementation language does not
justify silently changing document semantics.

React and SwiftUI own presentation, selection, navigation, panels, and transient
gesture state. Platform adapters own files, storage, clipboard, permissions,
window lifecycle, and rendering surfaces. DOM objects, native view objects,
and GPU resources remain outside serialized documents.

Move one behavior at a time with fixtures proving compatibility. The existing
TypeScript implementation remains authoritative until its replacement passes
those checks and is integrated. For migrated behavior, clients call the shared
core rather than maintaining independent editing rules or undo stacks.

UniFFI for Swift and wasm-bindgen for JavaScript/TypeScript are the initial
bindings, validated for the document-command pilot. Keep those adapters outside
the platform-independent core. Design coarse command/result interfaces and
explicit asset ownership rather than copying complete documents or image
buffers across the language boundary on every pointer event or frame.

## Rendering decision still required

The current Canvas 2D/PixiJS/Three.js renderer cannot simply be compiled to Rust.
A shared Rust renderer is the intended direction to investigate, but this
decision does not select wgpu or authorize a wholesale renderer rewrite.

Before selecting the renderer, prove a bounded composition in web and native
macOS, including text/font layout, an imported image, transparency, an effect,
and export. Define visual tolerances, color/alpha handling, asset ownership,
and performance/memory budgets. Evaluate wgpu as a candidate, including the
cost of replacing existing effects, shaders, and 3D behavior.

Preview, thumbnails, and export must retain consistent semantics. Record
unsupported capabilities explicitly; never silently discard unsupported nodes
or overwrite a richer project with a reduced native interpretation. Full
editor feature parity is not implied by the first native prototype.

## Monorepo layout

Pilot layout now implemented:

```text
apps/macos/                  SwiftUI application and macOS integration
crates/artifact-core/         Platform-independent Rust editor logic
crates/artifact-ffi/          Native binding adapter
crates/artifact-wasm/         Browser binding adapter
packages/artifact-core-web/   TypeScript-facing WASM package
tests/fixtures/core-parity/   Shared documents and expected command results
```

Retain the existing web, API, Backoffice, and shared packages. Cargo owns Rust
builds, Xcode/Swift tooling owns the native application, and the existing npm
workspace owns JavaScript packages. Wire their dependencies explicitly; a
monorepo does not require one compiler or package manager for every language.
Do not create placeholder clients for excluded platforms. Add renderer crates
only after the rendering decision.

## First proof and validation

The owner selected Viber as the real composition for this proof. See the
[Viber pilot](../web-macos-viber-pilot.md) for the verified input, browser export,
capability inventory, and proposed implementation checkpoints.

The first implementation slice should load one supported portable project in
both clients, apply the same edit and undo/redo through Rust, save/reopen it,
and export its supported composition. Native runs natively; web runs the WASM
build. Use shared fixtures to compare document results and separate render
fixtures to compare pixels within declared tolerances.

Validate Rust logic, native/WASM adapter contracts, existing web regressions,
and the native macOS workflow. Include malformed documents, missing assets,
and unsupported capabilities. The first build targets Apple Silicon and macOS 14 or later; build/test commands
and the remaining renderer proof are recorded in the pilot document. Signing,
notarization, distribution, and updates belong to a later delivery slice;
cloud synchronization is not implied by a shared document format.

## Consequences

The clients can share editing semantics while presenting platform-appropriate
interfaces. The cost is maintaining Rust, TypeScript, and Swift toolchains,
binding contracts, native UI, and compatibility tests. Adoption is incremental
so the working web editor remains usable throughout the migration.
