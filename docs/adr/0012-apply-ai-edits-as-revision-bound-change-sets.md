# Apply AI edits as revision-bound Change Sets

Chat Mode and the Context Assistant propose typed Change Sets against an explicit
base revision and never mutate the active document directly. Artifact renders an
interactive preview, lets the user edit or discard the proposal, and creates one
new revision only after `Apply`; stale proposals may rebase independent changes
but must surface conflicts. This adds orchestration and revision storage, but it
keeps AI actions inspectable, undoable, and compatible with concurrent manual
editing.
