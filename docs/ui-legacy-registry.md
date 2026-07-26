# UI Legacy Registry

Status: shrinking v0.48 contract. Q1 established the finite registry; Q2 and Q3
have reduced both products to zero registered runtime callers pending the Q4
conformance gate and Q5 deletion pass.

The machine-readable source of truth is
[`ui-legacy-registry.json`](./ui-legacy-registry.json). It closes the migration
inventory without deleting any compatibility contract. The registry assigns
all 19 configured route modules to UI Foundation and the relevant Product
System, binds embedded editor surfaces to their existing inventories, and
records every approved legacy reference as a finite, decreasing allowlist.

Run the guard with:

```bash
npm run quality:ui-legacy-registry
```

The guard fails when a configured route has no system assignment, a Foundation
Matrix identifier drifts, a registered legacy reference appears in a new file,
or an existing file gains more occurrences. Removing occurrences is allowed so
that #180 and #181 can contract the registry in place.

## Surface Assignment

### Artifact

| Surface | System assignment | Detail contract |
| --- | --- | --- |
| `/`, `/projects`, `/reset-password`, `/examples`, `/showcase` | UI Foundation where primitives apply; Artifact Design System for composition and theme | Route entries in the JSON registry |
| `/docs`, `/docs/nodes`, `/docs/recipes`, `/docs/reference`, `/docs/reference/:nodeId` | UI Foundation where primitives apply; Artifact Design System for documentation shells and product patterns | Route entries in the JSON registry |
| `/docs/style-guide` | Artifact Product Theme plus the shared UI Foundation Matrix | Four identifier sets in the JSON registry |
| `/app` shell, Layers, Add Library, commands, overlays | UI Foundation plus Artifact Design System | [`editor-workflow-inventory.md`](./editor-workflow-inventory.md) |
| Inspector and property surfaces | UI Foundation fields and feedback plus Artifact Inspector System | [`inspector-system-inventory.md`](./inspector-system-inventory.md) |
| Node canvas, preview, gallery, thumbnails, and 3D viewport chrome | Artifact Canvas Chrome System; UI Foundation for bounded controls and feedback | [`canvas-chrome-inventory.md`](./canvas-chrome-inventory.md) |

### Backoffice

| Surface | System assignment | Detail contract |
| --- | --- | --- |
| `/sign-in` | UI Foundation plus Backoffice Product Theme | [`backoffice.md`](./backoffice.md) |
| `/`, `/accounts`, `/accounts/:userId`, `/usage` under the admin layout | UI Foundation plus Backoffice UI System | [`backoffice.md`](./backoffice.md) |
| `/style-guide` | Backoffice Product Theme plus the shared UI Foundation Matrix | Four identifier sets in the JSON registry |

Backoffice has a zero legacy-module baseline: the former separate `Ui.tsx`
surface must not be recreated. Shared primitives belong in `@artifact/ui` and
Backoffice compositions belong in `components/backoffice-ui`.

## Finite Migration Batches

| Batch | Current registered contracts | Named replacement | Owner |
| --- | --- | --- | --- |
| `artifact-foundation-adapters` | Zero runtime callers; compatibility files remain registered for Q5 | Direct `@artifact/ui` primitives plus the Artifact Product Theme | #181 |
| `artifact-feature-entrypoints` | Zero runtime callers; root aliases remain registered for Q5 | Feature-folder public entrypoints | #181 |
| `artifact-inspector-selectors` | Zero `node-inspector-*` or `sidebar-section*` references | Source-owned `artifact-inspector-*` anatomy | #181 |
| `artifact-semantic-tokens` | Zero registered short-token references; declarations removed from `index.css` | `--surface-*`, `--line-*`, `--text-*`, `--accent-*`, `--state-*`, and `--font-*` | #181 |
| `backoffice-zero-baseline` | No callers | `@artifact/ui` plus `components/backoffice-ui` | #180 |

The exact paths and maximum occurrence counts live only in the JSON registry;
this document describes ownership and replacement boundaries rather than
duplicating the allowlist.

`legacyFiles` identifies files that may disappear once they have zero callers.
`legacyStylesheetSections` identifies only the named selectors or token uses
inside otherwise active stylesheets; those files are not deletion candidates.

## Foundation Matrix Contract

Artifact `/docs/style-guide` and Backoffice `/style-guide` both mount the same
command, field, feedback, and overlay matrices exported by `@artifact/ui`. The
registry records their shared specimen identifiers and the guard compares them
with the source arrays under `packages/ui/src`. Product-specific typography,
density, geometry, motion, and color remain owned by each Product Theme.

## Approved Non-Goals

Persistence migrations and references named `legacy` in document, package,
render, API, authentication, accounting, or AI code are not UI-removal
candidates. Route behavior is also unchanged. v0.48 may remove a registered UI
contract only after its named replacement is live and the allowlist reaches
zero.
