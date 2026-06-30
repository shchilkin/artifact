import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ALL_EMOJIS,
  type AspectRatio,
  type CanvasDocument,
  type EffectLayer,
  type EmojiLayer,
  type GraphEnvironmentNode,
  type GraphScene3DNode,
  type ImageLayer,
  type Layer,
  type ModelLayer,
  type PrimitiveLayer,
} from '../types/config';
import { isAssetUri, resolveImageSource, saveImageAsset } from '../utils/assetStore';
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
import { buildLayerTargetSummary } from '../utils/editorTargetSummary';
import { getScene3DTarget, getSceneEnvironmentNode, getSceneModelLayer } from '../utils/scene3DInputs';
import { AiGenerationPanel } from './AiGenerationPanel';
import { EditorTargetHeader } from './editor-target/EditorTargetHeader';
import { LayerPanel } from './LayerPanel';
import { LayerControls } from './layer-controls/LayerControls';
import type { LayerPanelProps } from './layers-panel/LayerPanel';
import { EnvironmentInspector } from './node-canvas/inspector/EnvironmentInspector';
import { Scene3DInspector } from './node-canvas/inspector/Scene3DInspector';
import { ActionButton } from './ui/ActionButton';

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
    <div className="sidebar-section">
      <button className="sidebar-section-trigger" onClick={() => setOpen((value) => !value)}>
        <span>{title}</span>
        <span className="sidebar-section-indicator">{open ? '▾' : '▸'}</span>
      </button>
      {open && <div className="sidebar-section-body">{children}</div>}
    </div>
  );
}

function AssetImagePreview({ src }: { src: string }) {
  const [resolvedAsset, setResolvedAsset] = useState({ src: '', value: '' });

  useEffect(() => {
    let cancelled = false;
    if (!isAssetUri(src)) return;
    resolveImageSource(src)
      .then((value) => {
        if (!cancelled) setResolvedAsset({ src, value: value ?? '' });
      })
      .catch(() => {
        if (!cancelled) setResolvedAsset({ src, value: '' });
      });
    return () => {
      cancelled = true;
    };
  }, [src]);

  const resolvedSrc = isAssetUri(src) ? (resolvedAsset.src === src ? resolvedAsset.value : '') : src;
  if (!resolvedSrc) {
    return (
      <div className="asset-image-preview asset-image-preview--empty checkerboard-surface">
        <span className="asset-image-preview__title">Image unavailable</span>
        <span className="asset-image-preview__copy">Replace the source to restore this layer.</span>
      </div>
    );
  }
  return <img src={resolvedSrc} alt="" className="asset-image-preview" />;
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
  if (!scene) return null;
  const model = getSceneModelLayer(doc.graph, doc.layers, scene.id);
  const environment = getSceneEnvironmentNode(doc.graph, scene.id);
  return {
    title: scene.name,
    eyebrow: 'Layers / 3D Scene',
    role: 'utility' as const,
    kindLabel: '3D Scene',
    description: 'Renders a model input with camera, material, environment, and light settings.',
    breadcrumbs: ['Layers', '3D Scene'],
    badges: [
      { label: 'Scene', tone: 'accent' as const },
      { label: model ? 'Model input' : 'No model', tone: model ? ('success' as const) : ('warning' as const) },
      { label: environment || scene.environmentName ? 'Environment' : 'No env', tone: 'muted' as const },
    ],
    notes: model
      ? []
      : [
          {
            text: 'Connect or import a model input before the scene can render model pixels.',
            tone: 'warning' as const,
          },
        ],
  };
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

function applySelectedLayerPatch<T extends Layer>(
  doc: CanvasDocument,
  selectedLayer: Layer,
  patch: Partial<T>,
  onDocChange: (doc: CanvasDocument) => void,
) {
  onDocChange(updateLayerInDocument(doc, selectedLayer.id, patch as Partial<Layer>));
}

function nextEmojiSet(layer: EmojiLayer, emoji: string) {
  if (layer.emojis.includes(emoji) && layer.emojis.length === 1) return layer.emojis;
  return layer.emojis.includes(emoji) ? layer.emojis.filter((item) => item !== emoji) : [...layer.emojis, emoji];
}

function saveSelectedImageSource(
  docRef: React.MutableRefObject<CanvasDocument>,
  targetLayerId: string,
  src: string,
  onDocChange: (doc: CanvasDocument) => void,
) {
  void saveImageAsset(src)
    .then((assetSrc) => onDocChange(replaceSelectedImageSourceInDocument(docRef.current, targetLayerId, assetSrc)))
    .catch(() => onDocChange(replaceSelectedImageSourceInDocument(docRef.current, targetLayerId, src)));
}

function readImageFileForLayer(
  file: File,
  layer: ImageLayer,
  docRef: React.MutableRefObject<CanvasDocument>,
  onDocChange: (doc: CanvasDocument) => void,
) {
  const targetLayerId = layer.id;
  const reader = new FileReader();
  reader.onload = (event) => {
    const src = event.target?.result;
    if (typeof src === 'string') saveSelectedImageSource(docRef, targetLayerId, src, onDocChange);
  };
  reader.readAsDataURL(file);
}

function imageLayerFromSelection(layer: Layer): ImageLayer | null {
  return layer.kind === 'image' ? layer : null;
}

function emojiLayerFromSelection(layer: Layer): EmojiLayer | null {
  return layer.kind === 'emoji' ? layer : null;
}

function SelectedLayerSections({
  doc,
  docRef,
  selectedLayer,
  selectedTargetSummary,
  onDocChange,
}: {
  doc: CanvasDocument;
  docRef: React.MutableRefObject<CanvasDocument>;
  selectedLayer: Layer | null;
  selectedTargetSummary: ReturnType<typeof buildLayerTargetSummary> | null;
  onDocChange: (doc: CanvasDocument) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  if (!selectedLayer) return null;

  const applyPatch = <T extends Layer>(patch: Partial<T>) => {
    applySelectedLayerPatch(doc, selectedLayer, patch, onDocChange);
  };
  const handleImageFile = (file: File) => {
    const imageLayer = imageLayerFromSelection(selectedLayer);
    if (imageLayer) readImageFileForLayer(file, imageLayer, docRef, onDocChange);
  };
  const toggleEmoji = (layer: EmojiLayer, emoji: string) => {
    applyPatch<EmojiLayer>({ emojis: nextEmojiSet(layer, emoji) });
  };

  return (
    <div className="layer-inspector-sections sidebar-sections">
      {selectedTargetSummary && <EditorTargetHeader summary={selectedTargetSummary} compact minimal />}
      <SelectedLayerBasics selectedLayer={selectedLayer} onPatch={applyPatch} />
      <SelectedImageSourceSection layer={selectedLayer} inputRef={fileInputRef} onImageFile={handleImageFile} />
      <SelectedEmojiSetSection layer={selectedLayer} onToggleEmoji={toggleEmoji} />
      <LayerControls
        layer={selectedLayer}
        detached
        surface="layers"
        onChange={(patch) => applyPatch(patch as Partial<Layer>)}
      />
    </div>
  );
}

function SelectedScene3DSections({
  doc,
  scene,
  selectedTargetSummary,
  onDocChange,
}: {
  doc: CanvasDocument;
  scene: GraphScene3DNode | null;
  selectedTargetSummary: ReturnType<typeof selectedSceneTargetSummary>;
  onDocChange: (doc: CanvasDocument) => void;
}) {
  if (!scene) return null;
  const model = getSceneModelLayer(doc.graph, doc.layers, scene.id);
  const environment = getSceneEnvironmentNode(doc.graph, scene.id);
  const updateScene = (patch: Partial<GraphScene3DNode>) =>
    onDocChange(updateScene3DNodeInDocument(doc, scene.id, patch));
  const updateEnvironment = (node: GraphEnvironmentNode, patch: Partial<GraphEnvironmentNode>) =>
    onDocChange(updateEnvironmentNodeInDocument(doc, node.id, patch));

  return (
    <div className="layer-inspector-sections sidebar-sections">
      {selectedTargetSummary && <EditorTargetHeader summary={selectedTargetSummary} compact minimal />}
      <SelectedScene3DInputSettings model={model} environment={environment} scene={scene} />
      <Scene3DInspector scene3dNode={scene} onChange={updateScene} detached />
      {environment && (
        <EnvironmentInspector
          environmentNode={environment}
          onChange={(patch) => updateEnvironment(environment, patch)}
          detached
        />
      )}
    </div>
  );
}

function SelectedSceneReadout({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="node-inspector-readout">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function sceneSourceName(model: ModelLayer | PrimitiveLayer | null) {
  if (!model) return 'No source connected';
  if (model.kind === 'model') return model.modelName || model.name;
  return model.name || `${model.primitiveShape} primitive`;
}

function sceneSourceDetail(model: ModelLayer | PrimitiveLayer) {
  if (model.kind === 'model') return `${model.modelMime || 'model'} · ${Math.round(model.modelBytes / 1024)} KB`;
  return `${model.primitiveShape} · procedural mesh`;
}

function SelectedScene3DInputSettings({
  model,
  environment,
  scene,
}: {
  model: ModelLayer | PrimitiveLayer | null;
  environment: GraphEnvironmentNode | null;
  scene: GraphScene3DNode;
}) {
  return (
    <Section title="Scene Inputs" defaultOpen>
      <SelectedSceneReadout
        label="3D Source"
        value={sceneSourceName(model)}
        detail={
          model ? sceneSourceDetail(model) : 'Model or primitive is a scene setting in Layers and a node in Nodes.'
        }
      />
      <SelectedSceneReadout
        label="Environment Map"
        value={environment?.environmentName || scene.environmentName || 'No environment connected'}
        detail={
          environment
            ? `${environment.environmentMime || 'environment'} · ${Math.round(environment.environmentBytes / 1024)} KB`
            : scene.environmentName
              ? `${scene.environmentMime || 'environment'} · ${Math.round(scene.environmentBytes / 1024)} KB`
              : 'Environment maps are scene settings in Layers and nodes in Nodes.'
        }
      />
    </Section>
  );
}

function SelectedImageSourceSection({
  layer,
  inputRef,
  onImageFile,
}: {
  layer: Layer;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onImageFile: (file: File) => void;
}) {
  const imageLayer = imageLayerFromSelection(layer);
  return imageLayer ? <ImageSourceSection layer={imageLayer} inputRef={inputRef} onImageFile={onImageFile} /> : null;
}

function SelectedEmojiSetSection({
  layer,
  onToggleEmoji,
}: {
  layer: Layer;
  onToggleEmoji: (layer: EmojiLayer, emoji: string) => void;
}) {
  const emojiLayer = emojiLayerFromSelection(layer);
  return emojiLayer ? <EmojiSetSection layer={emojiLayer} onToggleEmoji={onToggleEmoji} /> : null;
}

function SelectedLayerBasics({
  selectedLayer,
  onPatch,
}: {
  selectedLayer: Layer;
  onPatch: <T extends Layer>(patch: Partial<T>) => void;
}) {
  return (
    <Section title={`${selectedLayer.kind.toUpperCase()} LAYER`} defaultOpen>
      <div className="sidebar-toggle-row">
        <span>Visible</span>
        <label className="toggle-switch" aria-label="Toggle layer visibility">
          <input
            type="checkbox"
            checked={selectedLayer.visible}
            onChange={(event) => onPatch({ visible: event.target.checked } as Partial<Layer>)}
          />
          <span className="toggle-switch__track" />
        </label>
      </div>
      {selectedLayer.kind === 'effect' && (
        <div className="sidebar-toggle-row">
          <span>Use source alpha</span>
          <label className="toggle-switch" aria-label="Toggle effect alpha masking">
            <input
              type="checkbox"
              checked={selectedLayer.maskAlpha}
              onChange={(event) => onPatch<EffectLayer>({ maskAlpha: event.target.checked })}
            />
            <span className="toggle-switch__track" />
          </label>
        </div>
      )}
      <div className="sidebar-toggle-row">
        <span>Locked</span>
        <label
          className="toggle-switch"
          aria-label="Toggle layer delete and reorder lock"
          title="Protect from delete and layer reorder"
        >
          <input
            type="checkbox"
            checked={selectedLayer.locked}
            onChange={(event) => onPatch({ locked: event.target.checked } as Partial<Layer>)}
          />
          <span className="toggle-switch__track" />
        </label>
      </div>
    </Section>
  );
}

function ImageSourceSection({
  layer,
  inputRef,
  onImageFile,
}: {
  layer: ImageLayer;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onImageFile: (file: File) => void;
}) {
  return (
    <Section title="Image Source" defaultOpen hidden={layer.kind !== 'image'}>
      {layer.src ? (
        <AssetImagePreview src={layer.src} />
      ) : (
        <button className="image-source-empty-action" onClick={() => inputRef.current?.click()}>
          + Add image
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onImageFile(file);
          event.currentTarget.value = '';
        }}
      />
      <ActionButton
        className="image-source-replace-action"
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          const file = event.dataTransfer.files?.[0];
          if (file) onImageFile(file);
        }}
        variant="quiet"
      >
        Replace image
      </ActionButton>
    </Section>
  );
}

function EmojiSetSection({
  layer,
  onToggleEmoji,
}: {
  layer: EmojiLayer;
  onToggleEmoji: (layer: EmojiLayer, emoji: string) => void;
}) {
  return (
    <Section title="Emoji Set">
      <div className="grid grid-cols-8 gap-1">
        {ALL_EMOJIS.map((emoji) => (
          <button
            key={emoji}
            className={`emoji-btn ${layer.emojis.includes(emoji) ? 'active' : ''}`}
            onClick={() => onToggleEmoji(layer, emoji)}
          >
            {emoji}
          </button>
        ))}
      </div>
    </Section>
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
}: Props) {
  const selectedLayer = doc.layers.find((layer) => layer.id === selectedLayerId) ?? null;
  const selectedScene = getScene3DTarget(doc, selectedLayerId);
  const selectedTargetSummary = useMemo(() => selectedLayerTargetSummary(doc, selectedLayer), [doc, selectedLayer]);
  const selectedSceneSummary = useMemo(() => selectedSceneTargetSummary(doc, selectedScene), [doc, selectedScene]);
  const docRef = useDocumentRef(doc);
  const layerPanelHandlers = useLayerPanelHandlers({ docRef, onDocChange, onReorderLayers });

  const handleAspectChange = useCallback(
    (aspect: AspectRatio) => onDocChange(updateGlobalInDocument(doc, { aspect })),
    [doc, onDocChange],
  );

  const hasInspectorContent = Boolean(showAiGeneration || selectedLayer || selectedScene);

  return (
    <>
      <aside className="sidebar sidebar-layers-list">
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

      {hasInspectorContent && (
        <aside className="layer-inspector-drawer" aria-label="Layer settings">
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
          />
          <SelectedScene3DSections
            doc={doc}
            scene={selectedScene}
            selectedTargetSummary={selectedSceneSummary}
            onDocChange={onDocChange}
          />
        </aside>
      )}
    </>
  );
}
