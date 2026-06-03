# Product

## Register

product

## Users

Indie musicians and designers at their intersection — people who make their own album art and want aesthetic control without hiring anyone. They know what "risograph" means. They are the creator and the art director simultaneously. They use this on a phone between ideas or on a laptop before an upload. Context: lo-fi studio, bedroom, transit. Mood: shaping a cover with intent, whether the result is spare, elegant, textured, loud, or rough.

## Product Purpose

A creative image/poster editor for covers, posters, music visuals, and
eventually project/case-study presentation pages. Artifact starts as a
browser-first editor: choose a seed, layer or node workflow, presets, effects,
typography, procedural textures, primitives, and export-ready aspect ratios.

The tool is for people who want direct control over image, type, texture,
effects, and composition. Artifact should not prescribe the final style: the
work may be clean, rough, elegant, loud, restrained, or experimental. The
long-term product should feel less like a one-shot randomizer and more like a
compact creative studio: fast enough for sketches, controllable enough for
finished work.

Terminology rule: Artifact is an **editor** and a compact creative studio. Use
"generate" only for specific actions that create source material, such as AI
images, procedural textures, random seeds, or thumbnail rendering. Do not call
the product, workspace, primary route, or public CTA a "generator".

Public-surface terminology:

- **Showcase** is the made-in-Artifact gallery: curated work first, seeded
  random work second, and future reviewed agent-generated work once that
  pipeline can produce editable projects safely.
- **How-to / recipes** is a future learning surface for specific workflows. Do
  not turn the showcase into a manual.
- **Open editor** and **New blank canvas** both open the editor with a blank
  canvas by default. Showcase tiles are the path into existing editable
  projects.

## Product Direction

Artifact has two editing modes with different jobs:

- **Layers** are for speed: quick stacking, fast toggles, rough ordering, and
  direct edits.
- **Nodes** are for advanced work: branching, merging, effect chains, reusable
  procedural sources, and precise output structure.

Both modes must operate on one document. If a user organizes a composition in
nodes, the layer view should not become misleading; grouping, folders, or graph
areas should help the layer view respect the node structure instead of showing a
flat list that tells a different story.

The next product arc is control:

- more predictable effect controls
- more focused effects and procedural sources
- typography and font workflows that make strong type covers easy
- a showcase wall of made-in-Artifact work that makes the empty canvas less
  intimidating without mixing gallery browsing with how-to teaching
- a future how-to / recipes surface for learning specific workflows
- predictable export where aspect ratio is respected by every render surface

Artifact should borrow the useful skeleton of mature SaaS tools without
borrowing their corporate feeling. The product needs clear information
architecture, search, keyboard navigation, predictable states, accessibility,
error handling, and consistent interaction patterns across Layers and Nodes.
Those are reliability features, not a visual identity.

What Artifact should avoid is the admin-panel version of those patterns:
neutral dashboards, table-first management screens, generic card grids, verbose
configuration copy, and anything that makes the editor feel like a corporate
content tool. The editor chrome should stay direct, compact, creative, dark,
print-like, mono, and low-chrome. Its menus should behave like fast
command/library palettes, not like SaaS settings catalogs.

## Brand Personality

Deliberate. Tactile. Lo-fi in its materials, precise in its control. The
personality of a photocopied zine or risograph proof belongs to the interface
language, not to every user output.

## Anti-references

- Overdesigned dev-tool aesthetic: heavy neon gradients, crypto-bro purple, glowing grid backgrounds, too many visual effects competing with the UI itself.
- Generic "modern" SaaS without identity: Canva, Adobe Express — polished, neutral, corporate-safe.
- Corporate admin/productivity UI: dashboards, management tables, verbose setup
  panels, and configuration-heavy flows that make creative actions feel like
  back-office operations.
- Any design where someone could guess the palette from the domain name alone.

## Banned Words

- weird

Avoid broad labels that judge the whole output as strange. Prefer language that
names material, control, or finish: expressive, elegant, textured, rough,
experimental, polished, deliberate, layered, editable, or export-ready.

## Design Principles

1. **The tool has a material language.** The UI can feel print-like, tactile, and direct without deciding what the user's finished work should look like.
2. **Control without noise.** Every slider, button, and label earns its place. The interface is a mixing board, not a feature list. Remove chrome, not controls.
3. **Mobile is the first canvas.** This tool is used in moments — between ideas, on the go. Pocket-first layout is not an afterthought; it's the primary constraint.
4. **The seed is identity.** The seed number is a creative artifact — a serial number for a piece of art. It should be treated with weight, not as a form field.
5. **Honest materials.** Monospace, raw borders, no decorative chrome. Craft is in the composition. The UI doesn't perform aesthetics — it enables them.

## Accessibility & Inclusion

WCAG AA minimum. All interactive controls meet 44px touch target size. Color contrast checked at AA for text on background. Reduced motion respected for transitions.
