# Web + macOS checkpoint — 2026-09-23

Owner-approved local checkpoint: `checkpoint/web-macos-viber-text-2026-09-23`.
Branch: `codex/web-macos-architecture`. This is a recovery point, not a release,
production integration, publication, or renderer selection for the full editor.

## Accepted result

- Rust document session, lossless package preservation, bounded patch history,
  WASM and Swift/UniFFI adapters in one monorepo.
- Viber composition rendered in Web and native macOS with editable text,
  embedded images/fonts, seven shared CPU effects, and PNG export.
- Browser effects run in a cancellable worker.
- Scanlines and text content/size/color/X/Y edits support Undo/Redo.
- Real Web -> Mac -> Web text workflow passed. Final Web package is
  byte-identical to the native saved package; final Web PNG is 3000 x 3000.
  The supplied original remains unchanged. Minor rendering differences are
  accepted for this composition.

Validation and limits are recorded in [the pilot](./web-macos-viber-pilot.md).
Local fixture, GUI evidence, and the built native app are backed up separately
from Git because they are ignored/private. System-panel automation remains
unreliable; manual Open/Save works. Its root cause has not been established.

## Next increment

The owner authorized starting this sequence after the checkpoint. Item 1 is
saved as `eb0a51b` with tag `checkpoint/web-macos-fast-preview-2026-09-23`.
Its complete-history source bundle was verified under the task visualization
folder (`web-macos-fast-preview-checkpoint/source.bundle`, SHA-256
`067ddad07260143140e2e70b106cbe60889b29594b1f50ae78971745e757a1d7`).
The owner tentatively accepted the result; detailed GUI proof remains separate.
Item 2 is now authorized and implemented locally with adapter/native-render
checks. GUI acceptance is tracked in the pilot document. Item 3 is proposed.

Product promise: create a second cover from the existing project in both
clients, with responsive editing and a reliable save/reopen/export flow.

1. **Preview and export:** measure edit-to-preview time and memory on this Mac;
   separate working preview resolution from full-size export while keeping
   the same composition/effect semantics. Cancellation and stale-result tests
   must prove that rapid edits cannot display/export an old revision.
2. **Image replacement and transforms:** replace the main picture, move,
   scale, and rotate it using shared Rust commands. Verify undo and portable
   embedded assets through both clients and the return trip.
3. **Basic layer operations:** visibility, selection, duplicate/delete and
   ordering. Design ordering against the existing graph semantics before
   exposing it: changing the layer array alone does not change Viber's graph
   render order. Ship only operations whose semantics are proven in both modes.

Keep these as independently reviewable slices. First scope and measure item 1;
do not implement all three as one change. A separate native document-lifecycle
slice should cover recent files, keyboard shortcuts, close/quit guards and
recovery before everyday use is claimed.

Afterwards, add a small set of representative projects (including a non-square
document and transparent output) to expose portability gaps. Current pilot
coverage does not establish arbitrary document, font, effect, or graph support.
Native node editing, broad renderer replacement, cloud sync, other platforms,
distribution and production-web adoption remain separate decisions.
