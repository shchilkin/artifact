import type { ReactNode } from 'react';
import { ActionButton } from '../ui/ActionButton';
import { IconButton } from '../ui/IconButton';
import { Toolbar, ToolbarButton } from '../ui/Toolbar';
import { CANVAS_CHROME_INVARIANTS, CANVAS_CHROME_SURFACES } from './canvasChromeInventory';
import './canvas-chrome-specimens.css';
import './canvas-chrome-node-specimen.css';
import './canvas-chrome-preview-specimen.css';
import './canvas-chrome-gallery-specimen.css';
import './canvas-chrome-primitive-specimen.css';

const previewHandles = ['nw', 'ne', 'se', 'sw'] as const;
type CanvasChromeSurfaceId = (typeof CANVAS_CHROME_SURFACES)[number]['id'];

export function CanvasChromeSpecimens() {
  return (
    <div className="canvas-chrome-reference">
      <p className="canvas-chrome-reference__summary" data-canvas-chrome-inventory-summary>
        {CANVAS_CHROME_SURFACES.length} surfaces · {CANVAS_CHROME_INVARIANTS.length} invariants
      </p>
      <div className="canvas-chrome-specimens" aria-label="Canvas chrome reference specimens">
        <CanvasChromeSpecimen
          id="node-canvas"
          inventoryIds={['graph-viewport', 'graph-areas', 'nodes', 'edges-and-ports']}
          label="NodeCanvas"
          note="Graph structure remains legible at a glance."
        >
          <NodeCanvasSpecimen />
        </CanvasChromeSpecimen>
        <CanvasChromeSpecimen
          id="canvas-preview"
          inventoryIds={['canvas-preview']}
          label="CanvasPreview"
          note="Artwork stays primary while selection and drop chrome remain explicit."
        >
          <CanvasPreviewSpecimen />
        </CanvasChromeSpecimen>
        <CanvasChromeSpecimen
          id="node-gallery-canvas"
          inventoryIds={['thumbnails-and-gallery']}
          label="NodeGalleryCanvas"
          note="A focused view for checking detail, framing, and scale."
        >
          <NodeGallerySpecimen />
        </CanvasChromeSpecimen>
        <CanvasChromeSpecimen
          id="primitive-viewport-3d"
          inventoryIds={['primitive-viewport', 'scene-3d-viewport']}
          label="PrimitiveViewport3D"
          note="Camera ownership is visible before the gesture begins."
        >
          <PrimitiveViewportSpecimen />
        </CanvasChromeSpecimen>
      </div>
    </div>
  );
}

function CanvasChromeSpecimen({
  id,
  inventoryIds,
  label,
  note,
  children,
}: {
  id: string;
  inventoryIds: readonly CanvasChromeSurfaceId[];
  label: string;
  note: string;
  children: ReactNode;
}) {
  const mappedStateCount = CANVAS_CHROME_SURFACES.filter(({ id: surfaceId }) =>
    inventoryIds.includes(surfaceId),
  ).reduce((total, surface) => total + surface.states.length, 0);

  return (
    <article className="canvas-chrome-specimen" data-canvas-chrome-specimen={id}>
      <header className="canvas-chrome-specimen__header">
        <h3>{label}</h3>
        <p>{note}</p>
        <span className="canvas-chrome-specimen__inventory" data-canvas-chrome-inventory-count={mappedStateCount}>
          {mappedStateCount} mapped states
        </span>
      </header>
      <div className="canvas-chrome-specimen__body">{children}</div>
    </article>
  );
}

function NodeCanvasSpecimen() {
  return (
    <div className="canvas-chrome-node-canvas" data-canvas-chrome-role="graph-canvas" data-canvas-chrome-state="grid">
      <Toolbar
        className="canvas-chrome-toolbar"
        aria-label="Node canvas toolbar reference"
        data-canvas-chrome-state="toolbar-default"
      >
        <div>
          <span>Build</span>
          <ToolbarButton>＋ Add</ToolbarButton>
          <ToolbarButton>⌘ Layout</ToolbarButton>
          <ToolbarButton disabled data-canvas-chrome-state="toolbar-disabled">
            ▣ Area
          </ToolbarButton>
        </div>
        <div>
          <span>View</span>
          <ToolbarButton aria-pressed="true" data-canvas-chrome-state="toolbar-pressed">
            ◎ Output
          </ToolbarButton>
        </div>
      </Toolbar>
      <Toolbar
        className="canvas-chrome-toolbar-variants"
        aria-label="Account toolbar state references"
        data-canvas-chrome-state="account-variants"
      >
        <span>Account</span>
        <ToolbarButton disabled>Loading</ToolbarButton>
        <ToolbarButton>Sign in</ToolbarButton>
        <ToolbarButton>Sign out</ToolbarButton>
      </Toolbar>
      <div className="canvas-chrome-graph-area" data-canvas-chrome-state="area">
        <span>Cover system</span>
      </div>
      <div className="canvas-chrome-alignment-guides" data-canvas-chrome-state="alignment-guide" aria-hidden="true">
        <span />
        <span />
      </div>
      <svg className="canvas-chrome-edges" viewBox="0 0 720 330" preserveAspectRatio="none" aria-hidden="true">
        <path data-canvas-chrome-role="regular-edge" d="M180 188 C252 188 238 116 322 116" />
        <path
          className="canvas-chrome-edge-output"
          data-canvas-chrome-role="output-edge"
          d="M440 116 C510 116 502 188 566 188"
        />
      </svg>
      <div
        className="canvas-chrome-node canvas-chrome-node--source canvas-chrome-node--category-selected"
        data-canvas-node-kind="fill"
        data-canvas-selection-kind="fill"
      >
        <span className="canvas-chrome-node__kind">Fill</span>
        <strong>Night field</strong>
        <span className="canvas-chrome-port canvas-chrome-port--out" aria-hidden="true" />
      </div>
      <div
        className="canvas-chrome-node canvas-chrome-node--selected canvas-chrome-node--category-selected"
        data-canvas-chrome-state="selected-node"
        data-canvas-node-kind="text"
        data-canvas-selection-kind="text"
      >
        <span className="canvas-chrome-node__kind">Text</span>
        <strong>Cover title</strong>
        <span className="canvas-chrome-port canvas-chrome-port--in" aria-hidden="true" />
        <span
          className="canvas-chrome-port canvas-chrome-port--out canvas-chrome-port--connected"
          data-canvas-chrome-state="connected-port"
          aria-hidden="true"
        />
      </div>
      <div
        className="canvas-chrome-node canvas-chrome-node--output"
        data-canvas-chrome-state="output-path"
        data-canvas-node-kind="export"
      >
        <span className="canvas-chrome-node__kind">Export</span>
        <strong>Cover PNG</strong>
        <span className="canvas-chrome-port canvas-chrome-port--in" aria-hidden="true" />
      </div>
      <div className="canvas-chrome-perf-reference">
        <span data-canvas-chrome-state="preview-queue-status">Preparing previews · 2</span>
        <span data-canvas-chrome-state="performance-overlay">Perf · 60 FPS</span>
      </div>
      <div className="canvas-chrome-drop-target" aria-label="Add Library drag state references">
        <span data-canvas-chrome-state="add-drag-idle">Move over canvas</span>
        <span data-canvas-chrome-state="add-drag-ready">Drop to place</span>
        <span data-canvas-chrome-state="add-drag-edge">Insert on edge</span>
      </div>
    </div>
  );
}

function CanvasPreviewSpecimen() {
  return (
    <div className="canvas-chrome-preview-layout">
      <div className="canvas-chrome-preview-frame checkerboard-surface" data-canvas-chrome-state="transparent">
        <div className="canvas-chrome-artwork" aria-label="Deterministic cover artwork">
          <span>Artifact</span>
          <strong>Signal / Form</strong>
          <i aria-hidden="true" />
        </div>
        <div className="canvas-chrome-selection" data-canvas-chrome-state="selected">
          {previewHandles.map((handle) => (
            <span
              key={handle}
              className={`canvas-chrome-selection__handle canvas-chrome-selection__handle--${handle}`}
            />
          ))}
        </div>
        <div className="canvas-chrome-preview-drop" data-canvas-chrome-state="drop-image">
          Drop image · add layer
        </div>
      </div>
      <div className="canvas-chrome-state-stack" aria-label="Canvas preview recovery states">
        <ReferenceState state="error" label="Render error" detail="Last good frame stays visible." />
        <ReferenceState state="recovery" label="Recovery" detail="Retry render" action />
      </div>
    </div>
  );
}

function NodeGallerySpecimen() {
  return (
    <div className="canvas-chrome-gallery">
      <header>
        <div>
          <strong>Cover title</strong>
          <span>Text · output preview</span>
        </div>
        <IconButton label="Close gallery reference" icon="×" size="compact" />
      </header>
      <div
        className="canvas-chrome-viewport canvas-chrome-gallery__viewport"
        data-canvas-chrome-state="keyboard-focus"
        role="group"
        aria-label="Gallery viewport reference"
        tabIndex={0}
      >
        <div className="canvas-chrome-gallery__ready" data-canvas-chrome-state="ready">
          <div className="canvas-chrome-gallery__selection" data-canvas-chrome-state="selected">
            <span>Signal</span>
            <strong>Form</strong>
          </div>
        </div>
        <span className="canvas-chrome-gallery__zoom">125%</span>
      </div>
      <div className="canvas-chrome-gallery-state-grid" aria-label="Gallery state references">
        <div className="canvas-chrome-gallery-state" data-canvas-chrome-state="loading">
          <span>Loading</span>
          <i aria-hidden="true" />
          <i aria-hidden="true" />
        </div>
        <div
          className="canvas-chrome-gallery-state canvas-chrome-gallery-state--failed"
          data-canvas-chrome-state="failed"
        >
          <span>Preview failed</span>
          <ActionButton variant="secondary">Retry</ActionButton>
        </div>
        <div
          className="canvas-chrome-gallery-state canvas-chrome-gallery-state--narrow"
          data-canvas-chrome-state="narrow"
        >
          <span>Narrow</span>
          <div>
            <strong>Form</strong>
          </div>
        </div>
      </div>
    </div>
  );
}

function PrimitiveViewportSpecimen() {
  return (
    <div className="canvas-chrome-primitive">
      <div
        className="canvas-chrome-viewport canvas-chrome-primitive__frame canvas-chrome-primitive__frame--active"
        data-canvas-chrome-state="keyboard-focus"
        data-canvas-node-kind="primitive"
        role="group"
        aria-label="Active primitive viewport reference"
        tabIndex={0}
      >
        <span className="canvas-chrome-viewport-status" data-canvas-chrome-state="active">
          Camera active
        </span>
        <PrimitiveGlyph />
        <Toolbar className="canvas-chrome-viewport-controls" aria-label="Primitive viewport controls">
          <ToolbarButton aria-pressed="false">Unlocked</ToolbarButton>
          <ToolbarButton data-canvas-chrome-state="reset">Reset</ToolbarButton>
        </Toolbar>
      </div>
      <div className="canvas-chrome-primitive__aside">
        <div className="canvas-chrome-primitive__locked" data-canvas-chrome-state="locked">
          <PrimitiveGlyph />
          <span>Locked · graph gestures pass through</span>
        </div>
        <ReferenceState state="webgl-unavailable" label="3D unavailable" detail="Keep source frame · retry" />
      </div>
    </div>
  );
}

function PrimitiveGlyph() {
  return (
    <svg className="canvas-chrome-primitive__glyph" viewBox="0 0 180 150" aria-hidden="true">
      <polygon points="90,18 150,52 90,86 30,52" />
      <polygon points="30,52 90,86 90,134 30,100" />
      <polygon points="150,52 90,86 90,134 150,100" />
      <path d="M90 18V86M30 52L90 86L150 52M90 86V134" />
    </svg>
  );
}

function ReferenceState({
  state,
  label,
  detail,
  action = false,
}: {
  state: string;
  label: string;
  detail: string;
  action?: boolean;
}) {
  return (
    <div className="canvas-chrome-reference-state" data-canvas-chrome-state={state}>
      <span>{label}</span>
      <small>{detail}</small>
      {action ? <ActionButton variant="secondary">Retry</ActionButton> : null}
    </div>
  );
}
