# Native Layers and canvas interactions (P08, issue #268)

This package adds the macOS Layers/inspector/canvas workflow on the approved
integration base `0b39f6e9481114cb432d3606855ba144316bf99c`. It does not
change main Web code. Shared Rust adds typed `reorder_layers` and
`bootstrap_graph` commands; the native document and Undo timeline remain in
`NativeSession`.

The Layers panel uses a shared selection set with the inspector and canvas.
Command selection and Shift range selection follow macOS list behavior; layer
drag/drop and Command-Option-Up/Down reorder the selected group. Reorder is a
single shared structure transaction so a linear graph's chain edges and layer
array move together. It retains unrelated graph fields. Locked layers block
delete and reorder, while visibility, inspector properties and canvas movement
remain available. Duplicate/delete batches and uniform multi-layer property
patches commit once. Area membership/collapse actions use the shared graph
command. Creating the first area explicitly bootstraps a graph in the same
transaction; opening a stack document leaves it graphless, and one Undo
restores graph absence.

Inspector text and numeric fields keep an editable host draft. A valid change
updates the session's transaction draft and starts a new preview without
advancing the durable revision. Focus/selection change or Save/Export commits
the gesture once. Invalid input cancels the last valid transient state but
keeps the entered value for correction; Cancel restores the committed value.
Save Copy and recovery write the committed package plus a hash-linked draft
sidecar, never the transaction's temporary pixels. Panel generation changes on
draft edits so an already-open file panel cannot write a later state.

`LayerGeometry.swift` is the drawing/interaction seam: the renderer and canvas
use the same CoreText word wrapping, 92% line cap, overlong-word compression,
alignment, cap-height baseline and ink overhang. Image bounds come from decoded
pixels and the renderer's contain/cover/free fit calculation. Hit testing
applies the inverse layer transform and permits locked but visible objects.
Tile images have no direct canvas handles because their repetition has no
unique movable bound. Branching or utility-node graphs likewise have no layer
canvas handles because their output can transform or repeat a source; their
Layers and Nodes controls remain available. Pointer transform values live in
SwiftUI state and the transient preview plan;
the session commits the final multi-layer patch once. The graph draft path
invalidates its transient cache keys. ScrollView trackpad scrolling pans; pinch
and Fit change the view scale and recenter the artwork. Escape cancels a pointer
gesture. Arrow keys act only while the canvas has focus,
with 1-pixel moves or 10 pixels with Shift, measured in exported artwork
pixels at any zoom. A selected scale/rotation handle changes the arrow-key
mode; Option independently scales axes.

Automated evidence is `apps/macos/LayerInteractionCheck.swift`, run by
`npm run check:core-native`. It exercises live transaction plan/bitmap visibility,
stale preview rejection, Save Copy, invalid/cancel, one-step Undo/Redo,
multi-selection patch/duplicate, locked batch rejection, reorder, wrapped text
and decoded non-square image geometry, and stack/graph area creation/collapse.
This is model
and renderer evidence, not a claim of real GUI acceptance. The GUI pass uses
the synthetic public-font/image stack and area fixtures in the coordinator's
wave-four evidence directory and separately records observed workflows.

Early real macOS GUI triage on immutable QA bundles observed Shift multi-select,
wrapped rotated text outline alignment, an image selection handle, two-layer
duplicate with one Undo, stack area creation, native text paste/Undo, live text
commit on blur, and invalid numeric Save rejection. The GUI tool could not
deliver coordinate clicks after the app opened (`noWindowsAvailable`), so
pointer drag/drop, area collapse, scale/rotate handles, pan/Fit and Save Copy
round-trip were not yet accepted by that pass. Model tests cover their command
or geometry paths separately; those tests do not substitute for GUI proof.

An initial five-run local diagnostic on macOS 26.6.2 arm64, Apple Swift 6.3.3,
Rust 1.95.0 and Node 26.8.1 measured `stageInspector` through completion of
the updated 1000px native preview bitmap: median 12.90 ms, range 12.52–14.24
ms. Each test run writes its own diagnostic to
`test-results/core-pilot/layer-interaction/stage-to-bitmap.json`.
This excludes app event delivery and display presentation, so it is not an
input-to-present latency or frame-rate measurement. No native p95 or FPS
acceptance is claimed from this small model diagnostic.
