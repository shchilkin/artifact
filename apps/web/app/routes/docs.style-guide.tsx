import {
  FoundationCommandMatrix,
  FoundationFeedbackMatrix,
  FoundationFieldMatrix,
  FoundationOverlayMatrix,
} from '@artifact/ui';
import { type Node, type NodeProps, ReactFlow } from '@xyflow/react';
import { type CSSProperties, type ReactNode, useRef, useState } from 'react';
import type { MetaFunction } from 'react-router';
import { AddLibraryPanel } from '../components/add-library/AddLibraryPanel';
import type { AddLibraryAction } from '../components/add-library/addLibraryModel';
import { EditorTargetHeader } from '../components/editor-target/EditorTargetHeader';
import { LogoGlyph } from '../components/LogoGlyph';
import { LayerRow } from '../components/layers-panel/LayerRow';
import {
  BlendModeNote,
  FontPicker,
  InspectorColorInput,
  InspectorLabel,
  InspectorSection,
  InspectorSelect,
  InspectorSlider,
  InspectorTextArea,
  InspectorTextInput,
  InspectorToggle,
  ScaleLockRow,
} from '../components/node-canvas/inspector/fields';
import { PortRow } from '../components/node-canvas/inspector/PortRow';
import { NodeFrame } from '../components/node-canvas/nodes/NodeFrame';
import { NodeShell } from '../components/node-canvas/nodes/NodeShell';
import { NodePropertiesPanel } from '../components/node-canvas/panel/NodePropertiesPanel';
import '@xyflow/react/dist/style.css';
import '../components/node-canvas/node-canvas.css';
import { PublicPageLayout } from '../components/PublicPageLayout';
import { ProductSurfaceSpecimens } from '../components/product-surfaces/ProductSurfaceSpecimens';
import { ActionButton } from '../components/ui/ActionButton';
import { Badge } from '../components/ui/Badge';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '../components/ui/dialog';
import { EmptyState } from '../components/ui/EmptyState';
import { FloatingMenu } from '../components/ui/floating-menu';
import { IconButton } from '../components/ui/IconButton';
import { Input } from '../components/ui/Input';
import { MenuDivider, MenuItem } from '../components/ui/MenuItem';
import { Panel, PanelBody, PanelHeader } from '../components/ui/Panel';
import { PreviewFrame } from '../components/ui/PreviewFrame';
import { SearchField } from '../components/ui/SearchField';
import { SegmentedControl, SegmentedControlTrigger } from '../components/ui/SegmentedControl';
import {
  Sheet,
  SheetBody,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '../components/ui/sheet';
import { Toolbar, ToolbarButton } from '../components/ui/Toolbar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import {
  type CanvasDocument,
  type CanvasGraph,
  DEFAULT_EXPORT,
  type GraphArea,
  type Layer,
  makeEffectPresetLayer,
  makeTextLayer,
  type TextFontRef,
} from '../types/config';
import { buildLayerTargetSummary } from '../utils/editorTargetSummary';
import { EXPORT_NODE_ID } from '../utils/nodeGraph';
import './docs.style-guide.css';

export const meta: MetaFunction = () => [
  { title: 'Artifact editor style guide' },
  {
    name: 'description',
    content: 'Internal style guide for Artifact editor primitives, tokens, and reusable UI states.',
  },
];

const layers: Layer[] = [
  {
    id: 'style-layer-default',
    name: 'Source image',
    visible: true,
    locked: false,
    kind: 'image',
    src: '',
    fit: 'cover',
    opacity: 100,
    blendMode: 'normal',
    x: 0.5,
    y: 0.5,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
  },
  {
    id: 'style-layer-selected',
    name: 'Cover type',
    visible: true,
    locked: false,
    kind: 'text',
    content: 'TYPE',
    font: 'DISPLAY',
    size: 96,
    color: '#f4eadc',
    x: 0.5,
    y: 0.5,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    opacity: 100,
    blendMode: 'normal',
  },
  {
    id: 'style-layer-hidden',
    name: 'Hidden grain',
    visible: false,
    locked: false,
    kind: 'effect',
    preset: 'grain',
    value: 55,
    opacity: 100,
    blendMode: 'normal',
  },
  {
    id: 'style-layer-locked',
    name: 'Locked print wash',
    visible: true,
    locked: true,
    kind: 'fill',
    color: '#88402f',
    opacity: 100,
    blendMode: 'normal',
  },
];

const styleArea: GraphArea = {
  id: 'style-area',
  name: 'Output study',
  color: '#ff705f',
  nodeIds: ['style-layer-selected'],
};

const targetSummary = buildLayerTargetSummary(layers[2] as Layer, {
  surface: 'layers',
  layers,
});

interface StyleGuideFrameData extends Record<string, unknown> {
  kind: string;
  label: string;
  name: string;
  selected: boolean;
  outputPath: boolean;
  editing: boolean;
  muted?: boolean;
  deleteDisabled?: boolean;
  targetHandles: Array<{ id: string; top?: string }>;
  sourceHandles?: Array<{ id: string; top?: string }>;
  inputs: Array<{ label: string; portId: string }>;
  outputs: Array<{ label: string; portId: string }>;
  connected: { sources: Set<string>; targets: Set<string> };
}

type StyleGuideFrameNode = Node<StyleGuideFrameData, 'styleGuideFrame'>;

const styleGuideFrameNodes: StyleGuideFrameNode[] = [
  {
    id: 'style-frame-source',
    type: 'styleGuideFrame',
    position: { x: 0, y: 42 },
    draggable: false,
    selectable: false,
    data: {
      kind: 'fill',
      label: 'fill',
      name: 'Source fill',
      selected: false,
      outputPath: true,
      editing: false,
      targetHandles: [{ id: 'bg' }],
      inputs: [{ label: 'backdrop', portId: 'bg' }],
      outputs: [{ label: 'result', portId: 'out' }],
      connected: {
        targets: new Set(['style-frame-source::bg']),
        sources: new Set(['style-frame-source::out']),
      },
    },
  },
  {
    id: 'style-frame-selected',
    type: 'styleGuideFrame',
    position: { x: 376, y: 0 },
    draggable: false,
    selectable: false,
    data: {
      kind: 'text',
      label: 'text',
      name: 'Selected output text',
      selected: true,
      outputPath: true,
      editing: true,
      targetHandles: [{ id: 'bg' }],
      inputs: [{ label: 'backdrop', portId: 'bg' }],
      outputs: [{ label: 'result', portId: 'out' }],
      connected: {
        targets: new Set(['style-frame-selected::bg']),
        sources: new Set(['style-frame-selected::out']),
      },
    },
  },
  {
    id: 'style-frame-locked',
    type: 'styleGuideFrame',
    position: { x: 752, y: 42 },
    draggable: false,
    selectable: false,
    data: {
      kind: 'image',
      label: 'image',
      name: 'Muted locked image',
      selected: false,
      outputPath: false,
      editing: false,
      muted: true,
      deleteDisabled: true,
      targetHandles: [{ id: 'bg' }],
      inputs: [{ label: 'backdrop', portId: 'bg' }],
      outputs: [{ label: 'result', portId: 'out' }],
      connected: {
        targets: new Set(['style-frame-locked::bg']),
        sources: new Set(),
      },
    },
  },
  {
    id: 'style-frame-merge',
    type: 'styleGuideFrame',
    position: { x: 1128, y: 42 },
    draggable: false,
    selectable: false,
    data: {
      kind: 'merge',
      label: 'merge',
      name: 'Two input merge',
      selected: false,
      outputPath: true,
      editing: false,
      targetHandles: [
        { id: 'a', top: '36%' },
        { id: 'b', top: '64%' },
      ],
      inputs: [
        { label: 'base', portId: 'a' },
        { label: 'top', portId: 'b' },
      ],
      outputs: [{ label: 'mix', portId: 'out' }],
      connected: {
        targets: new Set(['style-frame-merge::a']),
        sources: new Set(['style-frame-merge::out']),
      },
    },
  },
];

const styleGuideFrameNodeTypes = {
  styleGuideFrame: StyleGuideFrameNodeComponent,
};

const styleGuideReactFlowOptions = { hideAttribution: true };

const styleGuidePanelTextLayer = makeTextLayer({
  id: 'style-panel-title',
  name: 'Cover title',
  content: 'MADE IN ARTIFACT',
  size: 84,
  color: '#f4eadc',
  x: 0.5,
  y: 0.24,
});

const styleGuidePanelEffectLayer = makeEffectPresetLayer('grain', {
  id: 'style-panel-grain',
  name: 'Paper grain',
  grain: 36,
  maskAlpha: true,
  seedOffset: 18,
});

const styleGuidePanelGraph: CanvasGraph = {
  edges: [
    {
      id: 'style-panel-title-grain',
      fromId: styleGuidePanelTextLayer.id,
      fromPort: 'out',
      toId: styleGuidePanelEffectLayer.id,
      toPort: 'in',
    },
    {
      id: 'style-panel-grain-export',
      fromId: styleGuidePanelEffectLayer.id,
      fromPort: 'out',
      toId: EXPORT_NODE_ID,
      toPort: 'in',
    },
  ],
  positions: {
    [styleGuidePanelTextLayer.id]: { x: 0, y: 0 },
    [styleGuidePanelEffectLayer.id]: { x: 360, y: 0 },
    [EXPORT_NODE_ID]: { x: 720, y: 0 },
  },
  mergeNodes: [],
  colorNodes: [],
  repeatNodes: [],
};

const styleGuidePanelDoc: CanvasDocument = {
  schemaVersion: 1,
  global: { bg: '#100806', seed: 3030, aspect: '1:1' },
  layers: [styleGuidePanelTextLayer, styleGuidePanelEffectLayer],
  graph: styleGuidePanelGraph,
  export: { ...DEFAULT_EXPORT, scale: 2 },
};

export default function DocsStyleGuide() {
  const noop = () => {};
  const handleAddLibrary = (action: AddLibraryAction) => {
    void action;
  };

  return (
    <PublicPageLayout className="docs-page">
      <main className="docs-feed docs-feed--style-guide style-guide-main">
        <section className="docs-intro" aria-labelledby="style-guide-title">
          <p className="docs-guide-section__eyebrow">Artifact editor design system</p>
          <h1 id="style-guide-title" className="docs-intro__headline">
            Style guide.
          </h1>
          <p className="docs-intro__deck">
            Reusable primitives, state specimens, and token checks for the editor. This route is intentionally
            deterministic so visual coverage can protect the UI contract.
          </p>
        </section>

        <StyleSection
          kicker="01 / Tokens"
          title="Shared contract"
          body="The first v0.30 token pass names reusable control sizes, typography, surfaces, focus rings, and state colors."
        >
          <div className="style-guide-token-grid" aria-label="Design token specimens">
            <div className="style-guide-brand-marks" aria-label="Artifact brand mark specimens">
              <BrandMarkSpec variant="frame" name="editor frame" value="crop / signal / node" />
              <BrandMarkSpec variant="path" name="node path" value="flow / branch / merge" />
              <BrandMarkSpec variant="stack" name="layer stack" value="source / stack / output" />
            </div>
            <TokenSpec name="surface panel" value="--surface-panel" color="var(--surface-panel)" />
            <TokenSpec name="surface input" value="--surface-control" color="var(--surface-control)" />
            <TokenSpec name="selected" value="--surface-selected" color="var(--surface-selected)" />
            <TokenSpec name="accent" value="--accent-primary" color="var(--accent-primary)" />
          </div>
        </StyleSection>

        <StyleSection
          kicker="02 / UI Foundation"
          title="Foundation Matrix"
          body="Shared command, field, feedback, async-state, and anchored-overlay anatomy rendered through the Artifact Product Theme."
        >
          <div className="style-guide-foundation-stack">
            <FoundationCommandMatrix />
            <FoundationFieldMatrix />
            <FoundationFeedbackMatrix />
            <FoundationOverlayMatrix />
          </div>
        </StyleSection>

        <StyleSection
          kicker="03 / Product surfaces"
          title="Artifact route patterns"
          body="Public navigation, recovery, artwork, projects, and learning surfaces share one tactile route language."
        >
          <ProductSurfaceSpecimens />
        </StyleSection>

        <StyleSection
          kicker="04 / Base primitives"
          title="Controls"
          body="Base primitives live in components/ui and should replace repeated local button, search, badge, and toolbar chrome."
        >
          <div className="style-guide-grid">
            <Specimen label="Action buttons">
              <ActionButton variant="primary">Primary</ActionButton>
              <ActionButton variant="secondary">Secondary</ActionButton>
              <ActionButton variant="quiet">Quiet</ActionButton>
              <ActionButton variant="danger">Danger</ActionButton>
              <ActionButton variant="secondary" disabled>
                Disabled
              </ActionButton>
            </Specimen>
            <Specimen label="Icon buttons">
              <IconButton label="Add layer" icon="+" variant="primary" />
              <IconButton label="Preview" icon="⌕" />
              <IconButton label="Delete" icon="×" variant="danger" />
              <IconButton label="Compact mute" icon="●" size="compact" />
            </Specimen>
            <Specimen label="Inputs and search" stack>
              <div className="style-guide-field-stack">
                <Input aria-label="Title input" defaultValue="Cover Type" />
                <Input aria-label="Error input" defaultValue="Missing source" invalid />
                <Input aria-label="Disabled input" defaultValue="Locked value" disabled />
                <SearchField aria-label="Search primitives" value="texture" readOnly onClear={noop} />
              </div>
            </Specimen>
            <Specimen label="Badges toolbar and segmented">
              <Badge>Default</Badge>
              <Badge variant="selected">Selected</Badge>
              <Badge variant="warning">Hidden</Badge>
              <Badge variant="danger">Locked</Badge>
              <Toolbar aria-label="Tool controls">
                <ToolbarButton aria-pressed="true">Move</ToolbarButton>
                <ToolbarButton>Crop</ToolbarButton>
                <ToolbarButton>Mask</ToolbarButton>
              </Toolbar>
              <SegmentedControl aria-label="Mode">
                <SegmentedControlTrigger aria-pressed="true">Layers</SegmentedControlTrigger>
                <SegmentedControlTrigger>Nodes</SegmentedControlTrigger>
              </SegmentedControl>
            </Specimen>
            <Specimen label="Tabs dialogs sheets menus" stack>
              <OverlayPrimitiveSpecimens />
            </Specimen>
            <Specimen label="Panels rows and previews" stack>
              <Panel aria-label="Panel primitive specimen">
                <PanelHeader
                  eyebrow="Panel"
                  title="Surface"
                  action={<IconButton label="Close panel specimen" icon="×" size="compact" />}
                />
                <PanelBody>
                  <MenuItem label="Open source" hint="↵" />
                  <MenuItem label="Delete source" hint="⌫" variant="danger" />
                  <MenuDivider />
                  <PreviewFrame label="Preview frame" footer="ready" tone="selected">
                    <div className="style-guide-preview-fill" />
                  </PreviewFrame>
                </PanelBody>
              </Panel>
            </Specimen>
            <Specimen label="Empty states" stack>
              <EmptyState
                eyebrow="Empty"
                title="Blank canvas"
                body="Start with a source, then shape the composition with layers or nodes."
                actions={
                  <>
                    <ActionButton variant="primary">Add source</ActionButton>
                    <ActionButton variant="quiet">Open project</ActionButton>
                  </>
                }
              />
            </Specimen>
          </div>
        </StyleSection>

        <StyleSection
          kicker="04 / Editor states"
          title="Layer rows"
          body="Layer states must stay visually distinct: selected, hidden, locked, and selected plus hidden are treated as product states."
        >
          <div className="style-guide-layer-stack" aria-label="Layer row state specimens">
            {layers.map((layer) => (
              <LayerRow
                key={layer.id}
                layer={layer}
                areas={layer.id === 'style-layer-selected' ? [styleArea] : []}
                selected={layer.id === 'style-layer-selected' || layer.id === 'style-layer-hidden'}
                dragOverPosition={null}
                editing={false}
                onSelect={noop}
                onOpenContextMenu={noop}
                onStartEditing={noop}
                onFinishRename={noop}
                onDragStart={noop}
                onDragOverLayer={noop}
                onDropLayer={noop}
                onDragEnd={noop}
                onToggleVisible={noop}
                onDuplicateLayer={noop}
                onRemoveLayer={noop}
              />
            ))}
          </div>
        </StyleSection>

        <StyleSection
          kicker="05 / Graph states"
          title="Node frames"
          body="Node shells and frames preserve canvas readability through selected, output-path, muted, handles, and delete-disabled states."
          wide
        >
          <div className="style-guide-graph-specimens">
            <div className="style-guide-node-toolbar-specimen" aria-label="Node toolbar group specimen">
              <div className="node-canvas-toolbar">
                <div className="node-toolbar-group node-toolbar-group-build" aria-label="Build actions">
                  <span className="node-toolbar-group-label" aria-hidden="true">
                    Build
                  </span>
                  <button type="button">＋ Add node</button>
                  <button type="button">⌘ Layout</button>
                </div>
                <div className="node-toolbar-group" aria-label="View actions">
                  <span className="node-toolbar-group-label" aria-hidden="true">
                    View
                  </span>
                  <button type="button">◎ Output</button>
                </div>
                <div className="node-toolbar-group node-toolbar-group-debug" aria-label="Debug actions">
                  <span className="node-toolbar-group-label" aria-hidden="true">
                    Debug
                  </span>
                  <button type="button" aria-pressed="true">
                    ▥ Metrics
                  </button>
                </div>
              </div>
            </div>
            <div className="style-guide-node-grid" aria-label="Node shell state specimens">
              <NodeSpec kind="fill" label="fill" name="Source fill" outputPath />
              <NodeSpec kind="text" label="text" name="Cover type" selected outputPath />
              <NodeSpec kind="image" label="image" name="Muted source" muted deleteDisabled />
            </div>
            <div className="style-guide-node-frame-specimen" aria-label="Node frame state specimens">
              <ReactFlow
                nodes={styleGuideFrameNodes}
                nodeTypes={styleGuideFrameNodeTypes}
                edges={[]}
                fitView
                fitViewOptions={{ padding: 0.16 }}
                nodesDraggable={false}
                nodesConnectable={false}
                nodesFocusable={false}
                edgesFocusable={false}
                panOnDrag={false}
                zoomOnScroll={false}
                zoomOnPinch={false}
                zoomOnDoubleClick={false}
                preventScrolling={false}
                proOptions={styleGuideReactFlowOptions}
              />
            </div>
          </div>
        </StyleSection>

        <StyleSection
          kicker="06 / Add Library"
          title="Creation surface"
          body="Add Library remains a key editor primitive. The style guide keeps search, rows, detail preview, and tags visible in one place."
          wide
        >
          <div className="add-library-surface style-guide-add-library-surface" aria-label="Add Library style specimen">
            <AddLibraryPanel
              surface="layers"
              searchLabel="Search style-guide layers and effects"
              placeholder="Add layer..."
              onAdd={handleAddLibrary}
              onClose={noop}
              autoFocusSearch={false}
            />
          </div>
        </StyleSection>

        <StyleSection
          kicker="07 / Inspector"
          title="Target and fields"
          body="Inspector primitives combine compact labels, readable values, badges, and explicit status notes."
        >
          <div className="style-guide-grid style-guide-grid--wide">
            <Specimen label="Target header" stack>
              <EditorTargetHeader summary={targetSummary} />
            </Specimen>
            <Specimen label="Inspector fields" stack>
              <InspectorFieldSpecimens />
            </Specimen>
          </div>
        </StyleSection>

        <StyleSection
          kicker="08 / Panels"
          title="Properties rail"
          body="The properties panel assembles target summaries, guardrails, and inspector controls into the right-rail surface."
          wide
        >
          <NodePropertiesPanelSpecimens />
        </StyleSection>
      </main>
    </PublicPageLayout>
  );
}

function StyleSection({
  kicker,
  title,
  body,
  children,
  wide = false,
}: {
  kicker: string;
  title: string;
  body: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <section className="docs-guide-section" aria-labelledby={`style-guide-${kicker.slice(0, 2)}`}>
      <div className="docs-guide-section__header">
        <p className="docs-guide-section__eyebrow">{kicker}</p>
        <h2 id={`style-guide-${kicker.slice(0, 2)}`} className="docs-guide-section__title">
          {title}
        </h2>
        <p className="style-guide-section-body">{body}</p>
      </div>
      <div
        className={
          wide
            ? 'docs-guide-section__body style-guide-section-content style-guide-section-content--wide'
            : 'docs-guide-section__body style-guide-section-content'
        }
      >
        {children}
      </div>
    </section>
  );
}

function Specimen({ label, children, stack = false }: { label: string; children: ReactNode; stack?: boolean }) {
  return (
    <div className="style-guide-specimen">
      <div className="style-guide-specimen-label">{label}</div>
      <div className={`style-guide-specimen-body${stack ? ' style-guide-specimen-body--stack' : ''}`}>{children}</div>
    </div>
  );
}

function BrandMarkSpec({ name, value, variant }: { name: string; value: string; variant: 'frame' | 'path' | 'stack' }) {
  return (
    <div className="style-guide-brand-mark">
      <LogoGlyph size={56} variant={variant} />
      <div>
        <span className="style-guide-token-name">{name}</span>
        <span className="style-guide-token-value">{value}</span>
      </div>
    </div>
  );
}

function TokenSpec({ name, value, color }: { name: string; value: string; color: string }) {
  return (
    <div className="style-guide-token" style={{ '--token-bg': color } as CSSProperties}>
      <span className="style-guide-token-name">{name}</span>
      <span className="style-guide-token-value">{value}</span>
    </div>
  );
}

function OverlayPrimitiveSpecimens() {
  return (
    <div className="style-guide-overlay-specimens">
      <Tabs defaultValue="layers" className="style-guide-tabs">
        <TabsList aria-label="Style guide tabs">
          <TabsTrigger value="layers">Layers</TabsTrigger>
          <TabsTrigger value="nodes">Nodes</TabsTrigger>
        </TabsList>
        <TabsContent value="layers">Layer state specimens stay readable.</TabsContent>
        <TabsContent value="nodes">Node state specimens keep graph context visible.</TabsContent>
      </Tabs>
      <div className="style-guide-overlay-actions">
        <Dialog>
          <DialogTrigger asChild>
            <ActionButton variant="secondary">Open dialog specimen</ActionButton>
          </DialogTrigger>
          <DialogContent className="style-guide-dialog-content">
            <DialogTitle className="style-guide-overlay-title">Dialog specimen</DialogTitle>
            <DialogDescription className="style-guide-overlay-copy">
              A modal primitive with Artifact focus, surface, and button styling.
            </DialogDescription>
            <div className="style-guide-overlay-row">
              <Badge variant="selected">Focus trapped</Badge>
              <Badge>Radix mechanics</Badge>
            </div>
            <DialogClose asChild>
              <ActionButton variant="primary">Close dialog specimen</ActionButton>
            </DialogClose>
          </DialogContent>
        </Dialog>
        <Sheet>
          <SheetTrigger asChild>
            <ActionButton variant="secondary">Open sheet specimen</ActionButton>
          </SheetTrigger>
          <SheetContent className="style-guide-sheet-content">
            <SheetHeader className="style-guide-sheet-header">
              <SheetTitle className="style-guide-overlay-title">Sheet specimen</SheetTitle>
              <SheetDescription className="style-guide-overlay-copy">
                A side panel primitive for projects, import flows, and mobile creation surfaces.
              </SheetDescription>
            </SheetHeader>
            <SheetBody className="style-guide-sheet-body">
              <Badge>Panel surface</Badge>
              <Badge variant="selected">Keyboard dismiss</Badge>
            </SheetBody>
            <SheetFooter className="style-guide-sheet-footer">
              <SheetClose asChild>
                <ActionButton variant="primary">Close sheet specimen</ActionButton>
              </SheetClose>
            </SheetFooter>
          </SheetContent>
        </Sheet>
        <FloatingMenuSpecimen />
      </div>
    </div>
  );
}

function FloatingMenuSpecimen() {
  const triggerRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<{ open: boolean; x: number; y: number }>({ open: false, x: 0, y: 0 });

  const openMenu = () => {
    const box = triggerRef.current?.getBoundingClientRect();
    setMenu({
      open: true,
      x: box ? box.left : 24,
      y: box ? box.bottom + 6 : 24,
    });
  };

  return (
    <>
      <div ref={triggerRef}>
        <ActionButton variant="secondary" onClick={openMenu}>
          Open menu specimen
        </ActionButton>
      </div>
      {menu.open ? (
        <FloatingMenu
          x={menu.x}
          y={menu.y}
          open={menu.open}
          onOpenChange={(open) => setMenu((current) => ({ ...current, open }))}
          className="artifact-menu style-guide-floating-menu"
        >
          <MenuItem label="Duplicate" hint="⌘D" />
          <MenuItem label="Mute" hint="M" />
          <MenuItem label="Delete" hint="⌫" variant="danger" />
        </FloatingMenu>
      ) : null}
    </>
  );
}

function InspectorFieldSpecimens() {
  const [sectionOpen, setSectionOpen] = useState(true);
  const [title, setTitle] = useState('Cover Type');
  const [caption, setCaption] = useState('Print texture, clean type, final output.');
  const [opacity, setOpacity] = useState(82);
  const [blendMode, setBlendMode] = useState('screen');
  const [visible, setVisible] = useState(true);
  const [color, setColor] = useState('#ff705f');
  const [font, setFont] = useState<TextFontRef>('DISPLAY');
  const [scaleLocked, setScaleLocked] = useState(true);
  const [scale, setScale] = useState({ scaleX: 0.92, scaleY: 1.08 });

  return (
    <div className="node-props-body style-guide-inspector-panel">
      <InspectorSection
        title="Content"
        summary={`${font} · ${opacity}%`}
        open={sectionOpen}
        onToggle={() => setSectionOpen((open) => !open)}
      >
        <div className="node-inspector-control">
          <InspectorLabel>Title</InspectorLabel>
          <InspectorTextInput value={title} placeholder="Cover title" onChange={setTitle} />
        </div>
        <div className="node-inspector-control">
          <InspectorLabel>Caption</InspectorLabel>
          <InspectorTextArea value={caption} onChange={setCaption} />
        </div>
        <FontPicker label="Font" value={font} onChange={setFont} />
        <InspectorSlider
          label="Opacity"
          value={opacity}
          valueLabel={`${opacity}%`}
          min={0}
          max={100}
          onChange={setOpacity}
        />
        <InspectorSelect
          label="Blend"
          value={blendMode}
          options={[
            { value: 'normal', label: 'Normal' },
            { value: 'screen', label: 'Screen' },
            { value: 'multiply', label: 'Multiply' },
          ]}
          onChange={setBlendMode}
        />
        <BlendModeNote value={blendMode} />
        <InspectorColorInput label="Color" value={color} onChange={setColor} />
        <InspectorToggle label="Visible" checked={visible} onChange={setVisible} />
      </InspectorSection>
      <InspectorSection title="Placement" summary="Pixel-facing controls" open onToggle={() => {}}>
        <ScaleLockRow
          scaleX={scale.scaleX}
          scaleY={scale.scaleY}
          locked={scaleLocked}
          onLockChange={setScaleLocked}
          onChange={(patch) => setScale((current) => ({ ...current, ...patch }))}
        />
      </InspectorSection>
    </div>
  );
}

function NodePropertiesPanelSpecimens() {
  const noop = () => {};

  return (
    <div className="style-guide-props-grid" aria-label="Node properties panel state specimens">
      <NodePropertiesPanelSpecimen label="No selection">
        <NodePropertiesPanel
          open
          selectedNodeId={null}
          doc={styleGuidePanelDoc}
          graph={styleGuidePanelGraph}
          exportBusy={false}
          onUpdateLayer={noop}
          onUpdateMergeNode={noop}
          onUpdateColorNode={noop}
          onUpdateRepeatNode={noop}
          onUpdateMaterialNode={noop}
          onUpdateExportConfig={noop}
          onUpdateAspectRatio={noop}
          onExport={noop}
          onClose={noop}
        />
      </NodePropertiesPanelSpecimen>
      <NodePropertiesPanelSpecimen label="Layer-backed text">
        <NodePropertiesPanel
          open
          selectedNodeId={styleGuidePanelTextLayer.id}
          doc={styleGuidePanelDoc}
          graph={styleGuidePanelGraph}
          exportBusy={false}
          onUpdateLayer={noop}
          onUpdateMergeNode={noop}
          onUpdateColorNode={noop}
          onUpdateRepeatNode={noop}
          onUpdateMaterialNode={noop}
          onUpdateExportConfig={noop}
          onUpdateAspectRatio={noop}
          onExport={noop}
          onClose={noop}
        />
      </NodePropertiesPanelSpecimen>
      <NodePropertiesPanelSpecimen label="Effect node">
        <NodePropertiesPanel
          open
          selectedNodeId={styleGuidePanelEffectLayer.id}
          doc={styleGuidePanelDoc}
          graph={styleGuidePanelGraph}
          exportBusy={false}
          onUpdateLayer={noop}
          onUpdateMergeNode={noop}
          onUpdateColorNode={noop}
          onUpdateRepeatNode={noop}
          onUpdateMaterialNode={noop}
          onUpdateExportConfig={noop}
          onUpdateAspectRatio={noop}
          onExport={noop}
          onClose={noop}
        />
      </NodePropertiesPanelSpecimen>
      <NodePropertiesPanelSpecimen label="Export target">
        <NodePropertiesPanel
          open
          selectedNodeId={EXPORT_NODE_ID}
          doc={styleGuidePanelDoc}
          graph={styleGuidePanelGraph}
          exportBusy={false}
          onUpdateLayer={noop}
          onUpdateMergeNode={noop}
          onUpdateColorNode={noop}
          onUpdateRepeatNode={noop}
          onUpdateMaterialNode={noop}
          onUpdateExportConfig={noop}
          onUpdateAspectRatio={noop}
          onExport={noop}
          onClose={noop}
        />
      </NodePropertiesPanelSpecimen>
    </div>
  );
}

function NodePropertiesPanelSpecimen({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="style-guide-props-specimen">
      <div className="style-guide-props-label">{label}</div>
      <div className="style-guide-props-body">{children}</div>
    </div>
  );
}

function StyleGuideFrameNodeComponent({ id, data }: NodeProps<StyleGuideFrameNode>) {
  return (
    <NodeFrame
      id={id}
      kind={data.kind}
      label={data.label}
      name={data.name}
      selected={data.selected}
      outputPath={data.outputPath}
      editing={data.editing}
      muted={data.muted}
      targetHandles={data.targetHandles}
      sourceHandles={data.sourceHandles}
      onSelect={() => {}}
      onToggleMuted={() => {}}
      onDelete={() => {}}
      deleteDisabled={data.deleteDisabled}
    >
      <div className="style-guide-node-frame-preview">
        <span>{data.selected ? 'selected' : data.outputPath ? 'output path' : 'preview'}</span>
      </div>
      <PortRow
        inputs={data.inputs.map((input) => ({ ...input, nodeId: id }))}
        outputs={data.outputs.map((output) => ({ ...output, nodeId: id }))}
        connected={data.connected}
      />
    </NodeFrame>
  );
}

function NodeSpec({
  kind,
  label,
  name,
  selected = false,
  outputPath = false,
  muted = false,
  deleteDisabled = false,
}: {
  kind: string;
  label: string;
  name: string;
  selected?: boolean;
  outputPath?: boolean;
  muted?: boolean;
  deleteDisabled?: boolean;
}) {
  return (
    <div className="style-guide-node-card">
      <NodeShell
        kind={kind}
        label={label}
        name={name}
        selected={selected}
        outputPath={outputPath}
        muted={muted}
        onToggleMuted={() => {}}
        onDelete={() => {}}
        deleteDisabled={deleteDisabled}
      >
        <div className="style-guide-preview-frame">preview</div>
      </NodeShell>
    </div>
  );
}
