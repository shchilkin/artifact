export type CanvasChromeDisposition = 'artifact-pattern' | 'approved-non-goal';

export interface CanvasChromeStateMapping {
  name: string;
  disposition: CanvasChromeDisposition;
  pattern: string;
}

export interface CanvasChromeSurfaceInventory {
  id:
    | 'graph-viewport'
    | 'graph-areas'
    | 'nodes'
    | 'edges-and-ports'
    | 'canvas-preview'
    | 'thumbnails-and-gallery'
    | 'primitive-viewport'
    | 'scene-3d-viewport';
  label: string;
  ownerIssue: `#${number}`;
  states: readonly CanvasChromeStateMapping[];
}

export interface CanvasChromeInvariant {
  id:
    | 'canvas-document'
    | 'graph-semantics'
    | 'renderer-entry-points'
    | 'render-signatures-and-caches'
    | 'export'
    | 'pointer-geometry'
    | 'camera-ownership';
  rule: string;
  proof: string;
}

export const CANVAS_CHROME_SURFACES = [
  {
    id: 'graph-viewport',
    label: 'Graph viewport',
    ownerIssue: '#173',
    states: [
      state('Resting grid', 'Artifact workspace surface and editor-grid token'),
      state('Empty graph', 'Artifact EmptyState inside the graph workspace'),
      state('Pan and zoom controls', 'Artifact compact toolbar control'),
      state('React Flow attribution', 'Required vendor attribution', 'approved-non-goal'),
      state('Selection marquee', 'Artifact selection outline'),
      state('Node alignment guides', 'Artifact direct-manipulation alignment line'),
      state('Add Library drag idle', 'Editor drop-target idle hint'),
      state('Add Library canvas-ready drop', 'Editor drop-target ready feedback'),
      state('Add Library edge-ready drop', 'Editor insertion target on the resolved edge'),
      state('Invalid canvas drop target', 'Editor danger notice without graph mutation'),
      state('Pane, node, and edge menus', 'Editor overlay pattern'),
      state('Toolbar default and hover', 'Artifact compact toolbar controls'),
      state('Toolbar keyboard focus', 'Artifact focus-visible outline'),
      state('Toolbar pressed', 'Artifact compact toolbar pressed state'),
      state('Toolbar disabled', 'Artifact compact toolbar disabled state'),
      state('Area create and add-to-area actions', 'Artifact organization command variants'),
      state('Account loading, signed-out, and signed-in actions', 'Artifact account command variants'),
      state('Preview queue status', 'Artifact compact progress feedback'),
      state('Performance metrics overlay', 'Artifact debug overlay'),
      state('Rendered graph position', 'React Flow geometry, not visual chrome', 'approved-non-goal'),
    ],
  },
  {
    id: 'graph-areas',
    label: 'Graph areas',
    ownerIssue: '#173',
    states: [
      state('Default area', 'Editor organization group'),
      state('Selected area', 'Editor organization group with selection outline'),
      state('Collapsed area', 'Editor organization group summary'),
      state('Empty area', 'Editor organization group empty state'),
      state('Dragging through an area', 'Editor dragging state with non-interactive area chrome'),
      state('Area color', 'Artifact organization tint; never a rendering instruction'),
    ],
  },
  {
    id: 'nodes',
    label: 'Node housings',
    ownerIssue: '#172',
    states: [
      state('Default node', 'NodeShell and NodeFrame resting state'),
      state('Hover', 'NodeShell tonal and border lift'),
      state('Keyboard focus', 'Artifact focus-visible outline'),
      state('Selected', 'NodeShell category-colored full selection outline'),
      state('Dragging', 'NodeShell temporary forward state'),
      state('Muted or hidden', 'NodeShell dimmed state with text treatment'),
      state('Locked or delete-disabled', 'NodeShell disabled action state'),
      state('Output path', 'NodeShell output-path contrast'),
      state('Thumbnail loading', 'PreviewFrame loading state'),
      state('Thumbnail ready', 'PreviewFrame ready state'),
      state('Thumbnail failed', 'PreviewFrame error and recovery state'),
      state('AI loading, error, current, and history badges', 'Artifact feedback and Badge patterns'),
      state('Rendered node pixels', 'Canonical renderer output, not visual chrome', 'approved-non-goal'),
    ],
  },
  {
    id: 'edges-and-ports',
    label: 'Edges and ports',
    ownerIssue: '#172',
    states: [
      state('Default edge', 'Artifact graph connection line'),
      state('Selected edge', 'Artifact selection line'),
      state('Output-path edge', 'Artifact output-path contrast'),
      state('Valid insertion edge', 'Editor drop-target feedback'),
      state('Invalid connection', 'Editor danger feedback without graph mutation'),
      state('Disconnected port', 'NodeFrame port resting state'),
      state('Connected port', 'NodeFrame connected state'),
      state('Connecting from or to port', 'NodeFrame active connection state'),
      state('Port keyboard focus', 'Artifact focus-visible outline'),
      state('Edge routing and port coordinates', 'React Flow geometry, not visual chrome', 'approved-non-goal'),
    ],
  },
  {
    id: 'canvas-preview',
    label: 'CanvasPreview',
    ownerIssue: '#174',
    states: [
      state('Loaded opaque artwork', 'Artifact preview frame'),
      state('Loaded transparent artwork', 'Artifact preview frame with checkerboard UI chrome'),
      state('Empty canvas', 'Artifact canvas EmptyState'),
      state('Render error', 'Artifact preview error state'),
      state('Recovery frame', 'Artifact preview recovery action'),
      state('Selected transformable layer', 'Artifact canvas selection and handle chrome'),
      state('Locked selection', 'Artifact locked selection treatment'),
      state('Hidden selection', 'Artifact hidden selection treatment'),
      state('Document, file, and image drop previews', 'Editor drop-target feedback'),
      state('Pointer and keyboard manipulation', 'Artifact direct-manipulation focus and active states'),
      state('Rendered document pixels', 'Canonical renderer output, not visual chrome', 'approved-non-goal'),
    ],
  },
  {
    id: 'thumbnails-and-gallery',
    label: 'Thumbnails and NodeGalleryCanvas',
    ownerIssue: '#175',
    states: [
      state('Thumbnail loading', 'PreviewFrame loading state'),
      state('Thumbnail ready', 'PreviewFrame ready state'),
      state('Thumbnail failed', 'PreviewFrame error and recovery state'),
      state('Selected thumbnail', 'PreviewFrame selected state'),
      state('Full gallery open', 'Editor overlay with preview frame'),
      state('Narrow gallery', 'Editor mobile sheet composition'),
      state('Gallery keyboard focus', 'Artifact focus-visible outline'),
      state('Gallery pan and zoom active', 'Artifact interactive viewport state'),
      state('Gallery transform handles', 'Artifact canvas selection and handle chrome'),
      state('Rendered preview pixels', 'Canonical renderer output, not visual chrome', 'approved-non-goal'),
    ],
  },
  {
    id: 'primitive-viewport',
    label: 'PrimitiveViewport3D',
    ownerIssue: '#176',
    states: [
      state('Loading', 'PreviewFrame loading state'),
      state('Ready and passive', 'Artifact 3D preview frame'),
      state('Active and unlocked', 'Artifact interactive viewport active state'),
      state('Hover camera ownership', 'Artifact interactive viewport hover state'),
      state('Keyboard focus', 'Artifact focus-visible outline'),
      state('Locked pass-through', 'Artifact locked viewport state'),
      state('Reset available', 'Artifact compact toolbar action'),
      state('WebGL unavailable', 'Artifact preview error and recovery state'),
      state('Node and modal modes', 'Artifact preview-frame size variants'),
      state('Rendered primitive pixels', 'Three.js renderer output, not visual chrome', 'approved-non-goal'),
    ],
  },
  {
    id: 'scene-3d-viewport',
    label: 'Scene and model 3D workspaces',
    ownerIssue: '#176',
    states: [
      state('Scene loading', 'PreviewFrame loading state'),
      state('Scene ready', 'Artifact 3D preview frame'),
      state('Scene active', 'Artifact interactive viewport active state'),
      state('Scene locked', 'Artifact locked viewport state'),
      state('Model or environment missing', 'Artifact preview error and recovery state'),
      state('Environment ready', 'Artifact preview-frame ready state'),
      state('Camera reset available', 'Artifact compact toolbar action'),
      state('Rendered scene pixels', 'Three.js renderer output, not visual chrome', 'approved-non-goal'),
    ],
  },
] as const satisfies readonly CanvasChromeSurfaceInventory[];

export const CANVAS_CHROME_INVARIANTS = [
  {
    id: 'canvas-document',
    rule: 'CanvasDocument remains the serialized source of truth and stays JSON-only.',
    proof:
      'Chrome may read document state and call existing commands, but may not add DOM, canvas, WebGL, cache, or gesture objects.',
  },
  {
    id: 'graph-semantics',
    rule: 'Graph mutation, validation, traversal, ordering, and area semantics remain unchanged.',
    proof: 'Connections still use graph helpers; areas remain organization metadata and never change rendering.',
  },
  {
    id: 'renderer-entry-points',
    rule: 'CanvasPreview, thumbnails, gallery, primitive previews, and export keep their canonical renderer entry points.',
    proof:
      'Chrome wraps the visible result; it does not replace renderDocument, renderGraphTarget, or Three.js scene rendering.',
  },
  {
    id: 'render-signatures-and-caches',
    rule: 'Every pixel-affecting input remains represented in render signatures and transient cache keys.',
    proof: 'Chrome state is excluded unless it changes pixels; canvases and promises remain outside CanvasDocument.',
  },
  {
    id: 'export',
    rule: 'Export renders directly from the canonical document and live primitive camera state.',
    proof: 'Preview frames, checkerboards, handles, menus, focus rings, and drop overlays never enter output pixels.',
  },
  {
    id: 'pointer-geometry',
    rule: 'Canvas and gallery pointer math continues to use document-space geometry and current preview dimensions.',
    proof:
      'Borders, padding, and responsive chrome must not change the coordinate frame used by handles, drop placement, pan, or zoom.',
  },
  {
    id: 'camera-ownership',
    rule: 'Primitive and scene camera drafts stay local during gestures and commit through existing viewport-state callbacks.',
    proof:
      'Unlocked viewports retain node-local event isolation; locked viewports pass pan and zoom back to React Flow.',
  },
] as const satisfies readonly CanvasChromeInvariant[];

function state(
  name: string,
  pattern: string,
  disposition: CanvasChromeDisposition = 'artifact-pattern',
): CanvasChromeStateMapping {
  return { name, pattern, disposition };
}
