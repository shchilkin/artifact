import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ALL_EMOJIS,
  type AspectRatio,
  type CanvasDocument,
  type EffectLayer,
  type EmojiLayer,
  type ImageLayer,
  type Layer,
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
  updateGlobalInDocument,
  updateLayerInDocument,
} from '../utils/documentCommands';
import { buildLayerTargetSummary } from '../utils/editorTargetSummary';
import { AiGenerationPanel } from './AiGenerationPanel';
import { EditorTargetHeader } from './editor-target/EditorTargetHeader';
import { LayerPanel } from './LayerPanel';
import { LayerControls } from './layer-controls/LayerControls';
import type { LayerPanelProps } from './layers-panel/LayerPanel';
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
  | 'onStartAiImage'
  | 'onLoadStarter'
  | 'onOpenProjects'
  | 'onRandomize'
  | 'onInsertLayerAbove'
  | 'onRemoveLayer'
  | 'onDuplicateLayer'
  | 'modeSwitcher'
>;

interface Props extends SidebarLayerPanelProps {
  doc: CanvasDocument;
  onDocChange: (doc: CanvasDocument) => void;
  onReorderLayers: (layers: Layer[]) => void;
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
    <div className="border-b border-border">
      <button
        className="flex items-center justify-between w-full min-h-11 px-3.5 cursor-pointer text-accent font-mono text-[10px] tracking-[2.5px] uppercase font-semibold hover:bg-accent-dim"
        onClick={() => setOpen((value) => !value)}
      >
        <span>{title}</span>
        <span className="text-dim text-[10px]">{open ? '▾' : '▸'}</span>
      </button>
      {open && <div className="px-3.5 pt-2 pb-3.5 flex flex-col gap-2.5">{children}</div>}
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
      <div className="w-full aspect-square border border-border checkerboard-surface flex flex-col items-center justify-center gap-2 px-3 text-center">
        <span className="font-mono text-[10px] uppercase tracking-[2.5px] text-accent">Image unavailable</span>
        <span className="font-mono text-[10px] text-dim leading-relaxed">
          Replace the source to restore this layer.
        </span>
      </div>
    );
  }
  return <img src={resolvedSrc} alt="" className="w-full aspect-square object-cover border border-border" />;
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

function CanvasAspectControls({ aspect, onChange }: { aspect: AspectRatio; onChange: (aspect: AspectRatio) => void }) {
  return (
    <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border flex-shrink-0">
      <span className="text-dim text-[9px] tracking-widest font-mono mr-1">CANVAS</span>
      {(['1:1', '4:5', '9:16', '16:9'] as AspectRatio[]).map((ratio) => (
        <button
          key={ratio}
          className={`text-[9px] font-mono px-1.5 py-0.5 border rounded-sm tracking-wide transition-colors ${
            aspect === ratio ? 'border-accent text-accent bg-accent-dim' : 'border-border text-dim hover:text-text'
          }`}
          onClick={() => onChange(ratio)}
        >
          {ratio}
        </button>
      ))}
    </div>
  );
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
    <div className="sidebar-sections border-t border-border flex-shrink-0 max-h-[60%]">
      {selectedTargetSummary && <EditorTargetHeader summary={selectedTargetSummary} compact />}
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
      <div className="flex justify-between items-center text-dim text-[10px]">
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
        <div className="flex justify-between items-center text-dim text-[10px]">
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
      <div className="flex justify-between items-center text-dim text-[10px]">
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
        <button
          className="border border-border text-dim h-24 text-[11px] font-mono hover:text-text"
          onClick={() => inputRef.current?.click()}
        >
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
        className="h-9 text-[11px]"
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
  onGeneratedImageSource,
}: {
  aspect: AspectRatio;
  onGeneratedImageSource?: (src: string, generation: NonNullable<ImageLayer['aiGeneration']>) => void;
}) {
  if (!onGeneratedImageSource) return null;
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
  onStartAiImage,
  onLoadStarter,
  onOpenProjects,
  onRandomize,
  onInsertLayerAbove,
  onRemoveLayer,
  onReorderLayers,
  onDuplicateLayer,
  onGeneratedImageSource,
  mobileActionBar,
  modeSwitcher,
}: Props) {
  const selectedLayer = doc.layers.find((layer) => layer.id === selectedLayerId) ?? null;
  const selectedTargetSummary = useMemo(() => selectedLayerTargetSummary(doc, selectedLayer), [doc, selectedLayer]);
  const docRef = useDocumentRef(doc);
  const layerPanelHandlers = useLayerPanelHandlers({ docRef, onDocChange, onReorderLayers });

  const setGlobal = <K extends keyof CanvasDocument['global']>(key: K, value: CanvasDocument['global'][K]) => {
    onDocChange(updateGlobalInDocument(doc, { [key]: value }));
  };

  return (
    <aside className="sidebar">
      <MobileActionBar content={mobileActionBar} />
      <CanvasAspectControls aspect={doc.global.aspect ?? '1:1'} onChange={(ratio) => setGlobal('aspect', ratio)} />

      <AiImageSection aspect={doc.global.aspect ?? '1:1'} onGeneratedImageSource={onGeneratedImageSource} />

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
          onLoadStarter={onLoadStarter}
          onOpenProjects={onOpenProjects}
          onRandomize={onRandomize}
          onInsertLayerAbove={onInsertLayerAbove}
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
          modeSwitcher={modeSwitcher}
        />
      </div>

      <SelectedLayerSections
        doc={doc}
        docRef={docRef}
        selectedLayer={selectedLayer}
        selectedTargetSummary={selectedTargetSummary}
        onDocChange={onDocChange}
      />
    </aside>
  );
}
