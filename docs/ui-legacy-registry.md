# UI Legacy Registry

Status: contracted v0.48 guard. Q1 established the finite registry; Q2 through
Q4 proved the replacement boundary, and Q5 removed the registered compatibility
surface after closing the final zero-caller gap in `SearchField`.

The machine-readable source of truth is
[`ui-legacy-registry.json`](./ui-legacy-registry.json). The registry assigns
all 19 configured route modules to UI Foundation and the relevant Product
System, binds embedded editor surfaces to their existing inventories, and keeps
removed imports, selectors, token aliases, and files as forbidden contracts.

Run the guard with:

```bash
npm run quality:ui-legacy-registry
```

The guard fails when a configured route has no system assignment, a Foundation
Matrix identifier drifts, a removed legacy reference appears, or one of the
seven deleted compatibility files is recreated.

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
| `artifact-foundation-adapters` | Compatibility files removed; imports and file paths are forbidden | Direct `@artifact/ui` primitives plus the Artifact Product Theme | #181, #183 |
| `artifact-feature-entrypoints` | Root aliases removed; imports and file paths are forbidden | Feature-folder public entrypoints | #181, #183 |
| `artifact-inspector-selectors` | Zero `node-inspector-*` or `sidebar-section*` references | Source-owned `artifact-inspector-*` anatomy | #181 |
| `artifact-semantic-tokens` | Zero registered short-token references; declarations removed from `index.css` | `--surface-*`, `--line-*`, `--text-*`, `--accent-*`, `--state-*`, and `--font-*` | #181 |
| `backoffice-zero-baseline` | No callers | `@artifact/ui` plus `components/backoffice-ui` | #180 |

The exact forbidden patterns and removed paths live only in the JSON registry;
this document describes ownership and replacement boundaries rather than
duplicating the machine contract.

`removedFiles` identifies the seven paths that must stay absent.
`removedStylesheetSections` records selectors or token uses removed from
otherwise active stylesheets; those parent stylesheets are not deletion
candidates, and the global forbidden-pattern contracts prevent reintroduction.

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
