# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Artifact is primarily for independent musicians and visual creators who make
artwork for music releases, posters, and related visual material. Album covers
are the product's entry point, not its boundary.

The primary user often acts as both creator and art director. They want direct
control without needing a production team and may move between a quick idea,
visual exploration, detailed composition, and a finished export.

The complete creative workflow must work on a desktop or laptop. Mobile is a
full but adapted entry point for capturing an idea, using Chat when available,
opening and reviewing projects, making focused edits, and exporting. Mobile
does not need to reproduce desktop interface density.

## Product Purpose

Artifact is a browser-based creative studio for turning an idea into editable
visual work. It supports covers, posters, music visuals, and other composed
image artifacts while keeping the result structured enough to revise, reopen,
and export reliably.

Success means a creator can move from direction to composition to finished
output without surrendering editability. Fast exploration and detailed control
belong to the same product and the same project rather than to separate,
flattened workflows.

Artifact must not prescribe the style of the finished work. The result may be
spare, polished, textured, loud, rough, elegant, or experimental.

## Positioning

Artifact turns a creative direction into an editable project that can be
developed through Chat, Layers, and Nodes without losing document structure or
preview/export parity. Layers and Nodes provide this foundation today; Chat is
the accepted next peer mode, not a separate AI product or a reduced editor.

This positions Artifact between one-shot generators, which tend to flatten the
result, and broad professional editors, which can make early creative
exploration unnecessarily heavy. Artifact combines a fast path to a compelling
artifact with a deeper path to inspect and shape how it was made.

## Operating Context

Creators use Artifact while developing release artwork and related visual
material: beginning from a blank project or showcase example, importing or
generating source material, composing it, iterating on effects and structure,
and exporting a finished asset. Work may begin as a short mobile interaction
and continue as a focused desktop session.

Artifact has two current editing modes with different jobs:

- **Layers** support speed: stacking, ordering, visibility, direct edits, and
  familiar composition work.
- **Nodes** support advanced control: branching, merging, reusable sources,
  effect chains, explicit output structure, and graph-level organization.

Both modes operate on the same creative document. The layer view must not tell
a misleading story when the project has been organized through nodes.

The planned Chat mode adds conversational creation and revision to the same
Project. It produces editable Creative Directions and Compositions, preserves
continuity with Layers and Nodes, and keeps assistant changes reviewable before
they become durable revisions.

## Capabilities and Constraints

Current product capabilities include:

- a canonical serializable `CanvasDocument` shared by editing, preview,
  thumbnails, project storage, and export;
- layer and node workflows for image, type, fill, procedural, effect, 3D, and
  compositing work;
- deterministic seeded sources and editable effect parameters;
- local projects and imported assets, authenticated cloud project
  infrastructure, portable `.artifact.json` documents, and image export;
- a made-in-Artifact Showcase whose projects open as editable documents;
- responsive product surfaces, keyboard interaction, and reduced-motion
  support.

Accepted planned capabilities include:

- Chat, Layers, and Nodes as three peer modes of one Project;
- editable Creative Directions and derived Compositions;
- Project-owned documents, revisions, Chats, Runs, and assets outside the
  renderer document;
- visual Change Previews before assistant edits are applied;
- explicitly invoked, scope-bound assistance rather than unsolicited critique
  or background changes.

Durable constraints:

- `CanvasDocument` remains serializable creative state and the canonical input
  to preview and export. Runtime objects and orchestration records stay outside
  it.
- Preview, thumbnails, Layers, Nodes, and export must use the same renderer
  semantics for the same document state.
- Generated images remain replaceable sources inside an editable composition;
  they are not treated as a fully decomposed document.
- Assistant proposals cannot silently overwrite conflicting manual edits.
- Full creative work is desktop-capable; mobile adapts the workflow by task
  instead of promising identical interface density.
- Product, release, pricing, customer, and performance claims require evidence;
  future work must not fabricate them.

Terminology commitments:

- Artifact is an **editor** and a **creative studio**. Use "generate" only for
  a specific source-making action, not for the product, workspace, or primary
  public CTA.
- **Showcase** is the made-in-Artifact gallery. It is not a manual.
- **How-to / recipes** is the separate learning surface for specific workflows.
- **Open editor** and **New blank canvas** start blank; Showcase projects are
  the path into existing editable work.
- **Creative Direction** is an editable direction or moodboard-like document;
  **Composition** is an editable concrete output document.

## Brand Commitments

The product name is **Artifact**. Its voice is deliberate, direct, tactile,
and precise. The interface may carry a lo-fi, print-oriented material identity,
but that identity belongs to the tool and must not dictate the user's output.

Artifact should feel like a compact creative instrument, not a corporate admin
product. Mature interaction mechanics such as search, keyboard navigation,
clear state, accessibility, and error recovery are welcome; neutral dashboard
language, verbose setup flows, and management-first framing are not.

Avoid broad language that judges an output as strange. In particular, do not
use **weird** as product or marketing language. Prefer words that name material,
control, process, or finish: editable, layered, textured, expressive,
deliberate, polished, rough, or export-ready.

## Evidence on Hand

- The runnable Artifact editor and public surfaces live in `apps/web`.
- The Showcase implementation and editable starter documents live in
  `apps/web/app/routes/showcase.tsx` and
  `apps/web/app/utils/starterDocuments.ts`.
- A real project identity asset is available at
  `apps/web/app/assets/Vantaa Underground Logo.png`.
- The canonical document and rendering contracts are documented in
  `docs/state-model.md` and `docs/rendering.md`.
- The accepted Chat, Creative Direction, revision, and Change Preview contract
  is documented in `docs/ai-assisted-creation.md` and the v0.50 version plan.
- Browser evidence for full editor workflows and adapted mobile behavior lives
  in `tests/browser/generator.spec.ts` and `tests/browser/mobile.spec.ts`.

There is no confirmed evidence of named customers, testimonials, press,
pricing, comparative benchmarks, or broad market adoption. Product and
marketing work must not invent these forms of proof.

## Product Principles

1. **Editable by default.** Creative output remains a project that can be
   understood, revised, and reopened rather than a flattened dead end.
2. **One project, multiple depths.** Chat, Layers, and Nodes serve different
   ways of working while preserving the same project and creative state.
3. **Fast start, deep control.** Early exploration should be lightweight
   without preventing precise composition later.
4. **The visible result is trustworthy.** Preview, thumbnails, project
   reopening, and export must agree about the artifact being made.
5. **Adapt by task, not by density.** Desktop supports the complete workflow;
   mobile preserves meaningful continuity through the tasks suited to it.

## Accessibility & Inclusion

WCAG AA is the minimum product standard. Interactive controls require usable
keyboard and focus behavior, touch targets should be at least 44px, text and
state contrast must remain legible, and reduced motion must preserve meaning
without forcing unnecessary animation.
