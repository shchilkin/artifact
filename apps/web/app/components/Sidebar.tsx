import { Button } from '@artifact/ui';
import { useCallback, useMemo, useState } from 'react';
import { type AspectRatio, type CanvasDocument, type ImageLayer, type Layer } from '../types/config';
import type { DocumentCommand } from '../utils/documentDispatch';
import { buildLayerTargetSummary } from '../utils/editorTargetSummary';
import { findGraphUtilityNode } from '../utils/nodeGraph';
import { AiGenerationPanel } from './AiGenerationPanel';
import { EditorTargetOverview } from './editor-target/EditorTargetHeader';
import { InspectorSection as ArtifactInspectorSection } from './inspector-system';
import { LayerTargetInspector } from './layer-controls/LayerTargetInspector';
import type { LayerPanelProps } from './layers-panel/LayerPanel';
import { LayerPanel } from './layers-panel/LayerPanel';
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
  | 'onStartAiImage'
  | 'onRemoveLayer'
  | 'onDuplicateLayer'
  | 'onApplyTreeEdit'
  | 'onEditInNodes'
  | 'modeSwitcher'
>;

interface Props extends SidebarLayerPanelProps {
  doc: CanvasDocument;
  onDocCommand: (command: DocumentCommand) => void;
  onReorderLayers: (layers: Layer[]) => void;
  showAiGeneration?: boolean;
  onGeneratedImageSource?: (src: string, generation: NonNullable<ImageLayer['aiGeneration']>) => void;
  mobileActionBar?: React.ReactNode;
  onReplaceModelLayerFile?: (id: string, file: File) => void;
  onLoadSceneEnvironmentFile?: (id: string, file: File) => void;
  onUseShapeSource?: (id: string) => void;
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

function selectedLayerTargetSummary(doc: CanvasDocument, selectedLayer: Layer | null) {
  if (!selectedLayer) return null;
  return buildLayerTargetSummary(selectedLayer, {
    surface: 'layers',
    graph: doc.graph,
    layers: doc.layers,
  });
}

function useLayerPanelHandlers({
  onDocCommand,
  onReorderLayers,
}: {
  onDocCommand: (command: DocumentCommand) => void;
  onReorderLayers: (layers: Layer[]) => void;
}) {
  const handleToggleVisible = useCallback(
    (id: string) => onDocCommand({ type: 'toggleLayerVisibility', id }),
    [onDocCommand],
  );
  const handleSetLayersVisible = useCallback(
    (ids: string[], visible: boolean) => onDocCommand({ type: 'setLayersVisibility', ids, visible }),
    [onDocCommand],
  );
  const handleCreateAreaFromLayers = useCallback(
    (ids: string[]) => {
      if (ids.length > 0) onDocCommand({ type: 'createArea', ids });
    },
    [onDocCommand],
  );
  const handleAddLayersToArea = useCallback(
    (areaId: string, ids: string[]) => {
      if (ids.length > 0) onDocCommand({ type: 'addToArea', areaId, ids });
    },
    [onDocCommand],
  );
  const handleRemoveLayersFromAreas = useCallback(
    (ids: string[]) => {
      if (ids.length > 0) onDocCommand({ type: 'removeFromAllAreas', ids });
    },
    [onDocCommand],
  );
  const handleRemoveNodesFromArea = useCallback(
    (areaId: string, ids: string[]) => {
      if (ids.length > 0) onDocCommand({ type: 'removeFromArea', areaId, ids });
    },
    [onDocCommand],
  );
  const handleReorderLayers = useCallback(
    (layers: Layer[], areaSeparation?: { areaId: string; ids: string[] }) => {
      if (!areaSeparation) {
        onReorderLayers(layers);
        return;
      }
      onDocCommand({ type: 'reorderLayersOutOfArea', layers, areaId: areaSeparation.areaId, ids: areaSeparation.ids });
    },
    [onDocCommand, onReorderLayers],
  );

  return {
    handleToggleVisible,
    handleSetLayersVisible,
    handleCreateAreaFromLayers,
    handleAddLayersToArea,
    handleRemoveLayersFromAreas,
    handleRemoveNodesFromArea,
    handleRemoveArea: (areaId: string) => onDocCommand({ type: 'removeArea', areaId }),
    handleRenameArea: (areaId: string, name: string) => onDocCommand({ type: 'renameArea', areaId, name }),
    handleReorderLayers,
    handleRenameLayer: (id: string, name: string) => onDocCommand({ type: 'renameLayer', id, name }),
  };
}

function SelectedLayerSections({
  doc,
  selectedLayer,
  selectedTargetSummary,
  onDocCommand,
  onReplaceModelLayerFile,
  onLoadSceneEnvironmentFile,
  onUseShapeSource,
}: {
  doc: CanvasDocument;
  selectedLayer: Layer | null;
  selectedTargetSummary: ReturnType<typeof buildLayerTargetSummary> | null;
  onDocCommand: (command: DocumentCommand) => void;
  onReplaceModelLayerFile?: (id: string, file: File) => void;
  onLoadSceneEnvironmentFile?: (id: string, file: File) => void;
  onUseShapeSource?: (id: string) => void;
}) {
  if (!selectedLayer) return null;
  const layerId = selectedLayer.id;
  // Patches can arrive after an async step (an image read, an AI generation), so they apply to the current document.
  const applyPatch = (patch: Partial<Layer>) => onDocCommand({ type: 'updateLayer', id: layerId, patch });

  return (
    <div className="layer-inspector-sections artifact-inspector-sidebar artifact-inspector-scroll">
      {selectedTargetSummary && <EditorTargetOverview summary={selectedTargetSummary} />}
      <LayerTargetInspector
        layer={selectedLayer}
        aspect={doc.global.aspect ?? '1:1'}
        onChange={applyPatch}
        onImageSource={(src) => onDocCommand({ type: 'replaceImageSource', id: layerId, src })}
        onLoadModelFile={onReplaceModelLayerFile ? (file) => onReplaceModelLayerFile(layerId, file) : undefined}
        onLoadEnvironmentFile={
          onLoadSceneEnvironmentFile ? (file) => onLoadSceneEnvironmentFile(layerId, file) : undefined
        }
        onUseShapeSource={onUseShapeSource ? () => onUseShapeSource(layerId) : undefined}
      />
    </div>
  );
}

function InspectorEmptyState({ hasLayers }: { hasLayers: boolean }) {
  return (
    <>
      <h2 className="sr-only">Layer settings</h2>
      {/* An empty document already shows its start actions on the canvas; nothing here to select. */}
      {hasLayers && (
        <EmptyState
          className="layer-inspector-empty-state"
          title="No layer selected"
          body="Select a layer to edit its settings."
        />
      )}
    </>
  );
}

/** A graph-only node selected from the Layers tree; its settings are edited in Nodes. */
function selectedGraphOnlyNode(doc: CanvasDocument, id: string | null) {
  if (!id) return null;
  const found = findGraphUtilityNode(doc.graph, id);
  return found ? found.node : null;
}

function GraphNodeInspectorNotice({
  node,
  onEditInNodes,
}: {
  node: { id: string; name: string } | null;
  onEditInNodes?: (nodeId: string) => void;
}) {
  if (!node) return null;
  return (
    <>
      <h2 className="sr-only">Node settings</h2>
      <EmptyState
        className="layer-inspector-empty-state"
        title={node.name}
        body="This node's settings are edited in Nodes."
        actions={
          onEditInNodes ? (
            <Button variant="primary" onClick={() => onEditInNodes(node.id)}>
              Edit in Nodes
            </Button>
          ) : undefined
        }
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
  onDocCommand,
  selectedLayerId,
  onSelectLayer,
  onAddLayer,
  onAddEffectPreset,
  onAddTextPreset,
  onAddNoisePreset,
  onAddArrayPreset,
  onStartAiImage,
  onRemoveLayer,
  onReorderLayers,
  onDuplicateLayer,
  onApplyTreeEdit,
  onEditInNodes,
  showAiGeneration,
  onGeneratedImageSource,
  mobileActionBar,
  modeSwitcher,
  onReplaceModelLayerFile,
  onLoadSceneEnvironmentFile,
  onUseShapeSource,
}: Props) {
  const selectedLayer = doc.layers.find((layer) => layer.id === selectedLayerId) ?? null;
  const selectedGraphNode = selectedGraphOnlyNode(doc, selectedLayerId);
  const selectedTargetSummary = useMemo(() => selectedLayerTargetSummary(doc, selectedLayer), [doc, selectedLayer]);
  const layerPanelHandlers = useLayerPanelHandlers({ onDocCommand, onReorderLayers });

  const handleAspectChange = useCallback(
    (aspect: AspectRatio) => onDocCommand({ type: 'setAspect', aspect }),
    [onDocCommand],
  );

  const hasInspectorContent = Boolean(showAiGeneration || selectedLayer || selectedGraphNode);

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
            onApplyTreeEdit={onApplyTreeEdit}
            onEditInNodes={onEditInNodes}
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
        {!hasInspectorContent && <InspectorEmptyState hasLayers={doc.layers.length > 0} />}
        {/* The notice stands in for the empty state; an open AI panel is the relevant content instead. */}
        <GraphNodeInspectorNotice node={showAiGeneration ? null : selectedGraphNode} onEditInNodes={onEditInNodes} />
        <AiImageSection
          aspect={doc.global.aspect ?? '1:1'}
          show={showAiGeneration}
          onGeneratedImageSource={onGeneratedImageSource}
        />
        <SelectedLayerSections
          doc={doc}
          selectedLayer={selectedLayer}
          selectedTargetSummary={selectedTargetSummary}
          onDocCommand={onDocCommand}
          onReplaceModelLayerFile={onReplaceModelLayerFile}
          onLoadSceneEnvironmentFile={onLoadSceneEnvironmentFile}
          onUseShapeSource={onUseShapeSource}
        />
      </aside>
    </>
  );
}
