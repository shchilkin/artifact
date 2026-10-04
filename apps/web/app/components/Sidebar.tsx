import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  type AspectRatio,
  type CanvasDocument,
  type GraphScene3DNode,
  type ImageLayer,
  type Layer,
} from '../types/config';
import {
  addLayersToGraphAreaInDocument,
  createGraphAreaInDocument,
  removeGraphAreaInDocument,
  removeNodesFromAllGraphAreasInDocument,
  removeNodesFromGraphAreaInDocument,
  renameGraphAreaInDocument,
  renameLayerInDocument,
  reorderDocumentLayersAndRemoveFromGraphArea,
  replaceSelectedImageSourceInDocument,
  setLayersVisibilityInDocument,
  toggleLayerVisibilityInDocument,
  updateEnvironmentNodeInDocument,
  updateGlobalInDocument,
  updateLayerInDocument,
  updateScene3DNodeInDocument,
} from '../utils/documentCommands';
import { buildGraphTargetSummary, buildLayerTargetSummary } from '../utils/editorTargetSummary';
import { findGraphUtilityNode } from '../utils/nodeGraph';
import { getScene3DTarget } from '../utils/scene3DInputs';
import { AiGenerationPanel } from './AiGenerationPanel';
import { EditorTargetOverview } from './editor-target/EditorTargetHeader';
import { InspectorSection as ArtifactInspectorSection } from './inspector-system';
import { LayerTargetInspector } from './layer-controls/LayerTargetInspector';
import type { LayerPanelProps } from './layers-panel/LayerPanel';
import { LayerPanel } from './layers-panel/LayerPanel';
import { SceneTargetInspector } from './node-canvas/inspector/SceneTargetInspector';
import { EmptyState } from './ui/EmptyState';

type SidebarLayerPanelProps = Pick<
  LayerPanelProps,
  | 'selectedLayerId'
  | 'onSelectLayer'
  | 'onAddLayer'
  | 'onAddEffectPreset'
  | 'onAddTextPreset'
  | 'onAddNoisePreset'
  | 'onAddArrayPreset'
  | 'onAddScene3D'
  | 'onStartAiImage'
  | 'onRemoveLayer'
  | 'onDuplicateLayer'
  | 'modeSwitcher'
>;

interface Props extends SidebarLayerPanelProps {
  doc: CanvasDocument;
  onDocChange: (doc: CanvasDocument) => void;
  onReorderLayers: (layers: Layer[]) => void;
  showAiGeneration?: boolean;
  onGeneratedImageSource?: (src: string, generation: NonNullable<ImageLayer['aiGeneration']>) => void;
  mobileActionBar?: React.ReactNode;
  onReplaceModelLayerFile?: (id: string, file: File) => void;
  onReplaceEnvironmentNodeFile?: (id: string, file: File) => void;
}

interface SectionProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  hidden?: boolean;
}

function Section({ title, children, defaultOpen = false, hidden = false }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  if (hidden) return null;
  return (
    <ArtifactInspectorSection
      className="artifact-inspector-section"
      density="ordinary"
      open={open}
      onToggle={() => setOpen((value) => !value)}
      slotClassNames={{
        body: 'artifact-inspector-section__body',
        indicator: 'artifact-inspector-section__indicator',
        trigger: 'artifact-inspector-section__trigger',
      }}
      title={title}
    >
      {children}
    </ArtifactInspectorSection>
  );
}

function useDocumentRef(doc: CanvasDocument) {
  const docRef = useRef(doc);
  useLayoutEffect(() => {
    docRef.current = doc;
  }, [doc]);
  return docRef;
}

function selectedLayerTargetSummary(doc: CanvasDocument, selectedLayer: Layer | null) {
  if (!selectedLayer) return null;
  return buildLayerTargetSummary(selectedLayer, {
    surface: 'layers',
    graph: doc.graph,
    layers: doc.layers,
  });
}

function selectedSceneTargetSummary(doc: CanvasDocument, scene: GraphScene3DNode | null) {
  if (!scene || !doc.graph) return null;
  return buildGraphTargetSummary(
    { kind: 'scene3d', node: scene },
    { graph: doc.graph, layers: doc.layers, surface: 'layers' },
  );
}

function useLayerPanelHandlers({
  docRef,
  onDocChange,
  onReorderLayers,
}: {
  docRef: React.MutableRefObject<CanvasDocument>;
  onDocChange: (doc: CanvasDocument) => void;
  onReorderLayers: (layers: Layer[]) => void;
}) {
  const handleToggleVisible = useCallback(
    (id: string) => onDocChange(toggleLayerVisibilityInDocument(docRef.current, id)),
    [docRef, onDocChange],
  );
  const handleSetLayersVisible = useCallback(
    (ids: string[], visible: boolean) => onDocChange(setLayersVisibilityInDocument(docRef.current, ids, visible)),
    [docRef, onDocChange],
  );
  const handleCreateAreaFromLayers = useCallback(
    (ids: string[]) => {
      if (ids.length > 0) onDocChange(createGraphAreaInDocument(docRef.current, ids));
    },
    [docRef, onDocChange],
  );
  const handleAddLayersToArea = useCallback(
    (areaId: string, ids: string[]) => {
      if (ids.length > 0) onDocChange(addLayersToGraphAreaInDocument(docRef.current, areaId, ids));
    },
    [docRef, onDocChange],
  );
  const handleRemoveLayersFromAreas = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      const next = removeNodesFromAllGraphAreasInDocument(docRef.current, ids);
      if (next !== docRef.current) onDocChange(next);
    },
    [docRef, onDocChange],
  );
  const handleRemoveNodesFromArea = useCallback(
    (areaId: string, ids: string[]) => {
      if (ids.length > 0) onDocChange(removeNodesFromGraphAreaInDocument(docRef.current, areaId, ids));
    },
    [docRef, onDocChange],
  );
  const handleReorderLayers = useCallback(
    (layers: Layer[], areaSeparation?: { areaId: string; ids: string[] }) => {
      if (!areaSeparation) {
        onReorderLayers(layers);
        return;
      }
      onDocChange(
        reorderDocumentLayersAndRemoveFromGraphArea(docRef.current, layers, areaSeparation.areaId, areaSeparation.ids),
      );
    },
    [docRef, onDocChange, onReorderLayers],
  );

  return {
    handleToggleVisible,
    handleSetLayersVisible,
    handleCreateAreaFromLayers,
    handleAddLayersToArea,
    handleRemoveLayersFromAreas,
    handleRemoveNodesFromArea,
    handleRemoveArea: (areaId: string) => onDocChange(removeGraphAreaInDocument(docRef.current, areaId)),
    handleRenameArea: (areaId: string, name: string) =>
      onDocChange(renameGraphAreaInDocument(docRef.current, areaId, name)),
    handleReorderLayers,
    handleRenameLayer: (id: string, name: string) => onDocChange(renameLayerInDocument(docRef.current, id, name)),
  };
}

function SelectedLayerSections({
  doc,
  docRef,
  selectedLayer,
  selectedTargetSummary,
  onDocChange,
  onReplaceModelLayerFile,
}: {
  doc: CanvasDocument;
  docRef: React.MutableRefObject<CanvasDocument>;
  selectedLayer: Layer | null;
  selectedTargetSummary: ReturnType<typeof buildLayerTargetSummary> | null;
  onDocChange: (doc: CanvasDocument) => void;
  onReplaceModelLayerFile?: (id: string, file: File) => void;
}) {
  if (!selectedLayer) return null;
  const layerId = selectedLayer.id;
  // Patches can arrive after an async step (an image read, an AI generation), so they apply to the current document.
  const applyPatch = (patch: Partial<Layer>) => onDocChange(updateLayerInDocument(docRef.current, layerId, patch));

  return (
    <div className="layer-inspector-sections artifact-inspector-sidebar artifact-inspector-scroll">
      {selectedTargetSummary && <EditorTargetOverview summary={selectedTargetSummary} />}
      <LayerTargetInspector
        layer={selectedLayer}
        aspect={doc.global.aspect ?? '1:1'}
        onChange={applyPatch}
        onImageSource={(src) => onDocChange(replaceSelectedImageSourceInDocument(docRef.current, layerId, src))}
        onLoadModelFile={onReplaceModelLayerFile ? (file) => onReplaceModelLayerFile(layerId, file) : undefined}
      />
    </div>
  );
}

function SelectedScene3DSections({
  doc,
  docRef,
  scene,
  selectedTargetSummary,
  onDocChange,
  onReplaceEnvironmentNodeFile,
}: {
  doc: CanvasDocument;
  docRef: React.MutableRefObject<CanvasDocument>;
  scene: GraphScene3DNode | null;
  selectedTargetSummary: ReturnType<typeof selectedSceneTargetSummary>;
  onDocChange: (doc: CanvasDocument) => void;
  onReplaceEnvironmentNodeFile?: (id: string, file: File) => void;
}) {
  if (!scene) return null;
  return (
    <div className="layer-inspector-sections artifact-inspector-sidebar artifact-inspector-scroll">
      {selectedTargetSummary && <EditorTargetOverview summary={selectedTargetSummary} />}
      <SceneTargetInspector
        doc={doc}
        scene={scene}
        onUpdateScene={(patch) => onDocChange(updateScene3DNodeInDocument(docRef.current, scene.id, patch))}
        onUpdateEnvironment={(id, patch) => onDocChange(updateEnvironmentNodeInDocument(docRef.current, id, patch))}
        onLoadEnvironmentFile={onReplaceEnvironmentNodeFile}
      />
    </div>
  );
}

function InspectorEmptyState() {
  return (
    <>
      <h2 className="sr-only">Layer settings</h2>
      <EmptyState
        className="layer-inspector-empty-state"
        title="No layer selected"
        body="Select a layer to edit its settings."
      />
    </>
  );
}

/** A graph-only node selected from the Layers tree; its settings are edited in Nodes. */
function selectedGraphOnlyNode(doc: CanvasDocument, id: string | null) {
  if (!id || !doc.graph) return null;
  const found = findGraphUtilityNode(doc.graph, id);
  return found && found.kind !== 'scene3d' ? found.node : null;
}

function GraphNodeInspectorNotice({ node }: { node: { name: string } | null }) {
  if (!node) return null;
  return (
    <>
      <h2 className="sr-only">Node settings</h2>
      <EmptyState
        className="layer-inspector-empty-state"
        title={node.name}
        body="This node's settings are edited in Nodes."
      />
    </>
  );
}

function MobileActionBar({ content }: { content?: React.ReactNode }) {
  return content ? <div className="sidebar-mobile-bar">{content}</div> : null;
}

function AiImageSection({
  aspect,
  show,
  onGeneratedImageSource,
}: {
  aspect: AspectRatio;
  show?: boolean;
  onGeneratedImageSource?: (src: string, generation: NonNullable<ImageLayer['aiGeneration']>) => void;
}) {
  if (!show || !onGeneratedImageSource) return null;
  return (
    <Section title="AI Image" defaultOpen>
      <AiGenerationPanel aspect={aspect} onGeneratedImageSource={onGeneratedImageSource} />
    </Section>
  );
}

export function Sidebar({
  doc,
  onDocChange,
  selectedLayerId,
  onSelectLayer,
  onAddLayer,
  onAddEffectPreset,
  onAddTextPreset,
  onAddNoisePreset,
  onAddArrayPreset,
  onAddScene3D,
  onStartAiImage,
  onRemoveLayer,
  onReorderLayers,
  onDuplicateLayer,
  showAiGeneration,
  onGeneratedImageSource,
  mobileActionBar,
  modeSwitcher,
  onReplaceModelLayerFile,
  onReplaceEnvironmentNodeFile,
}: Props) {
  const selectedLayer = doc.layers.find((layer) => layer.id === selectedLayerId) ?? null;
  const selectedScene = getScene3DTarget(doc, selectedLayerId);
  const selectedGraphNode = selectedGraphOnlyNode(doc, selectedLayerId);
  const selectedTargetSummary = useMemo(() => selectedLayerTargetSummary(doc, selectedLayer), [doc, selectedLayer]);
  const selectedSceneSummary = useMemo(() => selectedSceneTargetSummary(doc, selectedScene), [doc, selectedScene]);
  const docRef = useDocumentRef(doc);
  const layerPanelHandlers = useLayerPanelHandlers({ docRef, onDocChange, onReorderLayers });

  const handleAspectChange = useCallback(
    (aspect: AspectRatio) => onDocChange(updateGlobalInDocument(doc, { aspect })),
    [doc, onDocChange],
  );

  const hasInspectorContent = Boolean(showAiGeneration || selectedLayer || selectedScene || selectedGraphNode);

  return (
    <>
      <aside className="sidebar sidebar-layers-list" aria-label="Layers">
        <MobileActionBar content={mobileActionBar} />

        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <LayerPanel
            doc={doc}
            selectedLayerId={selectedLayerId}
            onSelectLayer={onSelectLayer}
            onAddLayer={onAddLayer}
            onAddEffectPreset={onAddEffectPreset}
            onAddTextPreset={onAddTextPreset}
            onAddNoisePreset={onAddNoisePreset}
            onAddArrayPreset={onAddArrayPreset}
            onAddScene3D={onAddScene3D}
            onStartAiImage={onStartAiImage}
            onRemoveLayer={onRemoveLayer}
            onReorderLayers={layerPanelHandlers.handleReorderLayers}
            onToggleVisible={layerPanelHandlers.handleToggleVisible}
            onSetLayersVisible={layerPanelHandlers.handleSetLayersVisible}
            onCreateAreaFromLayers={layerPanelHandlers.handleCreateAreaFromLayers}
            onAddLayersToArea={layerPanelHandlers.handleAddLayersToArea}
            onRemoveLayersFromAreas={layerPanelHandlers.handleRemoveLayersFromAreas}
            onRemoveNodesFromArea={layerPanelHandlers.handleRemoveNodesFromArea}
            onRemoveArea={layerPanelHandlers.handleRemoveArea}
            onRenameArea={layerPanelHandlers.handleRenameArea}
            onDuplicateLayer={onDuplicateLayer}
            onRenameLayer={layerPanelHandlers.handleRenameLayer}
            onAspectChange={handleAspectChange}
            modeSwitcher={modeSwitcher}
          />
        </div>
      </aside>

      {/* Always rendered: desktop reserves the inspector column even when nothing is selected. */}
      <aside
        className={`layer-inspector-drawer${hasInspectorContent ? '' : ' layer-inspector-drawer--empty'}`}
        aria-label="Layer settings"
      >
        {!hasInspectorContent && <InspectorEmptyState />}
        {/* The notice stands in for the empty state; an open AI panel is the relevant content instead. */}
        <GraphNodeInspectorNotice node={showAiGeneration ? null : selectedGraphNode} />
        <AiImageSection
          aspect={doc.global.aspect ?? '1:1'}
          show={showAiGeneration}
          onGeneratedImageSource={onGeneratedImageSource}
        />
        <SelectedLayerSections
          doc={doc}
          docRef={docRef}
          selectedLayer={selectedLayer}
          selectedTargetSummary={selectedTargetSummary}
          onDocChange={onDocChange}
          onReplaceModelLayerFile={onReplaceModelLayerFile}
        />
        <SelectedScene3DSections
          doc={doc}
          docRef={docRef}
          scene={selectedScene}
          selectedTargetSummary={selectedSceneSummary}
          onDocChange={onDocChange}
          onReplaceEnvironmentNodeFile={onReplaceEnvironmentNodeFile}
        />
      </aside>
    </>
  );
}
