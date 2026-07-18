# AI-Assisted Creation

Status: accepted as the product and domain contract for
[`v0.42 AI-Assisted Creation`](./version-plans/v0.42.md). Delivery is tracked in
GitHub milestone
[`v0.42 AI-Assisted Creation`](https://github.com/shchilkin/artifact/milestone/1).

This document defines AI-assisted creation as a third Artifact workflow beside
Layers and Nodes. It covers a full-screen conversational creation mode and an
explicit contextual assistant inside the existing editors. Both workflows must
produce or modify editable Artifact documents rather than stopping at chat text
or flattened previews.

## Product thesis

Artifact should support people who cannot or do not want to construct a design
with conventional editor controls. A person describes an outcome, receives a
usable visual result or an editable setup, and can continue either through
conversation or by opening the same work in Layers or Nodes.

AI-assisted creation has two distinct surfaces:

1. **Chat Mode** is a full-workspace, ChatGPT-like mode for creating directions,
   compositions, variants, and revisions.
2. **Context Assistant** is a Railway-like assistant opened explicitly from
   Layers or Nodes to propose a scoped change to the current document.

Do not label both surfaces simply as "AI chat". Their scope, navigation, and
expected outcomes differ even though they share the same orchestration and
proposal infrastructure.

## Current baseline

The current codebase already provides several required foundations:

- `CanvasDocument` is the canonical serialized creative document.
- Layers and Nodes are two editing surfaces over the same document.
- `renderDocument(...)` and `renderGraphTarget(...)` are the canonical preview
  and export paths.
- Authenticated provider-backed image and shader generation already has jobs,
  provider routing inputs, quota accounting, usage events, and a global Safety
  Budget.
- Generated images can be stored as normal image-layer sources with lightweight
  provenance while provider payloads and queue state remain outside the
  document.
- Cloud projects exist, but each current `cloud_projects` record owns one
  `doc_json` snapshot. The accepted AI model requires a Project to own multiple
  documents and revisions, so persistence must evolve deliberately.

The current `development` baseline does not yet contain server-backed Chat,
Context Thread, Run, multi-document Project, document revision, or Change Set
entities. This document describes the target MVP, not shipped behavior.

## Core model

### Ownership

```text
Project
|- Chats
|  |- Messages
|  `- Runs
|- Context Threads
|- Documents
|  `- Revisions
`- Assets
```

A Project is the durable creative workspace. A Chat is one conversational
session inside it, not the Project itself. Several Chats may work with the same
documents and assets without merging their transcripts.

Documents and assets belong to the Project rather than to a Chat. A Chat may
create or revise them, and a Context Thread may target them, but changing or
deleting a conversation must not implicitly delete creative work.

All Chat and Context Thread history is server-backed and available only to
authenticated users. There is no local-only chat history fallback.

### Document record and creative payload

Every editable result uses `CanvasDocument` as its creative payload so Layers,
Nodes, the renderer, thumbnails, and export keep one composition model.

Project-level document metadata stays outside `CanvasDocument` because it does
not affect rendered pixels:

- stable document id;
- Project ownership;
- Document Intent;
- current revision id;
- derivation relationship;
- display name and timestamps.

This wrapper may be called a Document Record in implementation. It must not
replace or fork the `CanvasDocument` renderer contract.

### Document intents

MVP supports two intents:

- **Creative Direction**: a moodboard-like document with references, generated
  studies, swatches, type direction, and composition notes.
- **Composition**: a concrete output such as an album cover, poster, single
  artwork, or adaptation.

Intent controls how the application frames and edits the document. It does not
create a second renderer or layer model.

When a user asks to turn a Creative Direction into a cover, Artifact creates a
new linked Composition. It does not overwrite the direction. The same rule
applies to adaptations such as turning a cover into a poster.

### Editability contract

Every setup and result produced by Chat Mode must be an Editable Artifact.
Depending on the request, it may contain:

- document aspect, background, seed, and export settings;
- layers, effects, masks, text, and transforms;
- graph nodes, connections, and areas;
- generation sources and prompts;
- generated assets and provenance.

Provider-generated imagery remains raster content inside a replaceable image
source. Its placement, mask, blend, effects, prompt, regeneration, and
composition remain editable; objects depicted inside the raster are not
promised as independent layers.

## Product behavior

### Chat Mode

Chat is a full-screen project mode alongside Layers and Nodes. It should not
embed a reduced editor next to the conversation.

The normal flow is:

1. The user describes an outcome or asks for a direction.
2. The assistant asks at most one or two questions only when the answers would
   materially change the format or result.
3. For a vague request, the assistant first offers two or three lightweight
   Creative Directions without expensive image generation.
4. For a concrete request, the assistant starts one Run for an editable
   Composition or Document Setup.
5. The completed response shows a rendered result and a compact structural
   summary.
6. `View in editor` opens the active document in Layers or Nodes while
   preserving the Chat, Run, and result context.
7. Returning to Chat restores the same conversation position and active
   artifact.

The initial route may exist before a Project. The server creates the Project
when the first durable artifact is produced or when the user explicitly attaches
the Chat to an existing Project.

### Context Assistant

The Context Assistant never opens itself, analyzes the document in the
background, or shows unsolicited suggestions. It runs only after explicit user
action.

MVP entry points are:

- `Ask AI` in the editor toolbar with `whole document` scope;
- `Ask AI` in a selection context menu with `selection` scope;
- `Ask AI` from a Layer, Node, or graph area with that item as scope.

The assistant receives the whole document as read context so it can understand
the composition. Its write scope is explicit and visible in the composer:

- selection;
- current node, layer, or area;
- whole document.

It may add, adjust, remove, explain, or propose a setup. It must not create a new
document unless the user explicitly changes the request into a derivation flow.

Context conversations are stored as Context Threads linked to their Project,
document, and initial scope. The primary Chat transcript receives only a compact
activity event after an applied contextual change, not the full local exchange.

### Navigation

`Chat`, `Layers`, and `Nodes` are three peer modes of one Project. Switching
modes preserves:

- active Project and document;
- active Chat or Context Thread;
- relevant Run or Change Set;
- return position in the conversation.

## Runs and generation

### Durable execution

Every actionable user request creates a server-backed Run with a stable id. A
Run survives navigation and page reloads and may orchestrate chat reasoning,
typed document tools, provider jobs, asset persistence, and canonical preview
rendering.

Run status and Run stage are separate concepts. A status describes lifecycle;
a stage explains current work to the user.

Suggested statuses:

- queued;
- running;
- succeeded;
- failed;
- cancelled.

Suggested visible stages:

- Understanding;
- Building setup;
- Generating assets;
- Rendering preview;
- Ready.

Individual asset failures may be retried without rerunning completed stages or
rebuilding the whole document. Cancelling a Run stops pending provider work but
does not remove already durable Project assets or previously applied revisions.

### Generation accounting

One successfully completed user-initiated Run consumes one Generation,
regardless of how many internal model or provider calls it required. Provider
failures, technical retries, and automatic repair attempts do not consume
additional Generations.

Several image variants requested in the same Run still consume one Generation.
Their individual calls, tokens, and estimated costs remain Provider Usage and
are subject to the Safety Budget, concurrency limits, and bounded variant
counts. A new user request for more variants creates a new Run and consumes a
new Generation when successful.

Quota reservation must occur before provider-backed work. It is committed only
when the Run produces a usable result.

### Generation strategy

Ordinary users choose an outcome strategy, not a provider:

- `Fast`;
- `Best quality`;
- `No image generation`.

Artifact routes to providers and models according to task fit, latency, cost,
availability, and policy. Grok Imagine is a suitable fast/low-cost image option,
but provider choice is not part of the document model and should not define the
product flow.

Advanced settings may pin a provider or model. Actual provider, model, prompt,
settings, usage, and provenance remain available in generation details for
diagnostics and repeatability.

## Change Sets

### Proposal before mutation

Neither Chat Mode nor the Context Assistant writes directly into the active
document. An edit request produces a Change Set against a `baseRevisionId`.

The normal cycle is:

```text
request -> Run -> Change Preview -> edit proposal -> Apply -> new Revision
```

Applying a Change Set is one durable, undoable creative action. Discarding it
leaves the document unchanged.

### Change Preview

A Change Preview must explain the result visually rather than exposing raw
commands or JSON.

In Chat Mode it includes:

- canonical rendered preview;
- short result summary;
- compact structural count such as `+3 layers`, `+2 nodes`, `1 asset`;
- `Apply`, `Discard`, `Edit setup`, and `View in editor` as appropriate.

In Layers and Nodes it additionally projects the Change Set into the existing
editor:

- proposed additions appear as temporary, clearly marked items;
- changed values expose before and after states;
- new graph connections are highlighted;
- removals are subdued and explicitly marked;
- destructive graph changes are separated from additive changes.

The proposal is interactive. Before applying, the user may remove an operation,
change a parameter, or adjust a generated prompt. Preview rendering still uses
the canonical renderer and transient assets; preview-only state must not enter
the current `CanvasDocument`.

### Destructive graph changes

Adding and configuring layers or nodes is the default assistant behavior.
Deleting nodes, disconnecting edges, replacing branches, or performing broad
graph rewrites must be called out in the Change Preview and require explicit
application.

Existing document locks and graph validity rules remain authoritative. A Change
Set cannot bypass locked-layer deletion, cycle prevention, serialization rules,
or canonical document commands.

### Concurrent edits

A Run reads a fixed base revision. If the Project document changes before
application, Artifact attempts an optimistic rebase:

- independent additions and edits may be rebased automatically;
- conflicting edits are never applied silently;
- the user may inspect conflicts, rebuild against the latest revision, or
  discard the proposal.

## Persistence and security boundaries

- Chat Mode and Context Assistant require an authenticated account.
- Chats, messages, Context Threads, Runs, Change Sets, documents, revisions,
  and server assets are owner-scoped Project data.
- Raw provider responses, queue state, credentials, usage accounting, and costs
  stay outside `CanvasDocument`.
- `CanvasDocument` revisions contain serializable creative state and stable
  asset references only.
- Generated asset bytes use server asset storage; opening a document may hydrate
  a local browser cache without making that cache the history source of truth.
- Chat text and Creative Content remain outside backoffice account-management
  views, consistent with the existing Creative Content boundary.

## UI contract

The full-screen Chat should feel like a focused creative conversation, not an
admin dashboard or a card catalog. Assistant messages, status, and result
previews form one flat reading flow.

Result previews may be framed tools, but avoid cards nested inside message
cards. Structural detail should disclose progressively instead of forcing a
full node/layer inventory into every response.

The Context Assistant uses the existing desktop right rail and responsive
drawer patterns. It should not compete with node-local gestures or define graph
semantics. Scope, pending status, conflict state, and Apply/Discard actions must
remain visible and keyboard accessible.

## MVP scope

Chat Mode supports three complete scenarios:

1. **Create direction**: request to editable Creative Direction document.
2. **Create composition**: request to editable cover or poster with generated
   assets when needed.
3. **Revise artifact**: instruction to Change Preview, edited proposal, Apply,
   and new Revision.

Context Assistant supports four scoped outcomes:

- add;
- adjust;
- remove;
- suggest setup.

The MVP also includes:

- server-backed Chat ids and history;
- multiple Chats per Project;
- Context Threads linked to documents and scope;
- Project-owned documents, revisions, and assets;
- derived document relationships;
- persistent asynchronous Runs with progress, cancellation, and retry;
- adaptive provider routing;
- revision-bound Change Sets and conflict handling;
- `Chat / Layers / Nodes` navigation continuity.

## Non-goals for the first release

- anonymous or local-only chat history;
- autonomous background critique or unsolicited suggestions;
- real-time multi-user collaboration;
- pixel-level decomposition of generated raster images;
- provider selection as the primary user workflow;
- unlimited image variants inside one Run;
- replacing the canonical renderer, layer model, or graph helpers;
- exposing raw document commands as the main Change Preview UI.

## Implementation sequence

Implementation should proceed through the existing architecture boundaries:

1. Introduce Project-owned document records, revisions, and derivation metadata
   while preserving `CanvasDocument` as the creative payload.
2. Add server-owned Chats, messages, Context Threads, and Runs with account
   authorization and Generation accounting.
3. Define typed document operations and Change Set validation over existing
   document commands and graph helpers.
4. Render proposed revisions through the canonical renderer without committing
   them to editor state.
5. Build the full-screen Chat Mode and navigation continuity.
6. Add the explicit Context Assistant entry points and editor projection for
   Change Previews.
7. Add optimistic rebase, destructive-change disclosure, retry, cancellation,
   and focused browser coverage.

The existing single-document cloud project persistence needs a migration plan
before step one. Exact database table names, provider catalog, and UI component
composition remain implementation choices unless promoted into a later ADR.

## MVP acceptance criteria

- A signed-in user can create a Chat with a stable server id and reopen it from
  history on another browser session.
- A direction request creates an editable Creative Direction document.
- A cover or poster request creates an editable Composition whose generated
  imagery is a replaceable image source.
- A direction can produce a linked Composition without overwriting the source.
- A Run persists progress across page reloads and can retry a failed asset
  stage.
- One successful Run commits exactly one Generation; provider calls remain
  separately auditable as Provider Usage.
- Every assistant edit is previewed as a revision-bound Change Set before it can
  alter the active document.
- A user can edit a proposed setup before applying it.
- Context Assistant runs only after explicit invocation and cannot write outside
  its visible scope without the user changing that scope.
- Conflicting changes against a stale base revision are not applied silently.
- `View in editor` and return to Chat preserve the same Project, document, Chat,
  and result context.
- Preview, editor, thumbnail, and export continue to use the canonical Artifact
  renderer for the same `CanvasDocument` state.
