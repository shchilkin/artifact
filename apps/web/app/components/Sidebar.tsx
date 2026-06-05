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
  const selectedTargetSummary = useMemo(
    () =>
      selectedLayer
        ? buildLayerTargetSummary(selectedLayer, {
            surface: 'layers',
            graph: doc.graph,
            layers: doc.layers,
          })
        : null,
    [doc.graph, doc.layers, selectedLayer],
  );
  const docRef = useRef(doc);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useLayoutEffect(() => {
    docRef.current = doc;
  }, [doc]);

  const setGlobal = <K extends keyof CanvasDocument['global']>(key: K, value: CanvasDocument['global'][K]) => {
    onDocChange(updateGlobalInDocument(doc, { [key]: value }));
  };

  const applySelectedPatch = <T extends Layer>(patch: Partial<T>) => {
    if (!selectedLayer) return;
    onDocChange(updateLayerInDocument(doc, selectedLayer.id, patch as Partial<Layer>));
  };

  const handleToggleVisible = useCallback(
    (id: string) => {
      const current = docRef.current;
      onDocChange(toggleLayerVisibilityInDocument(current, id));
    },
    [onDocChange],
  );

  const handleSetLayersVisible = useCallback(
    (ids: string[], visible: boolean) => {
      const current = docRef.current;
      onDocChange(setLayersVisibilityInDocument(current, ids, visible));
    },
    [onDocChange],
  );

  const handleCreateAreaFromLayers = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      onDocChange(createGraphAreaInDocument(docRef.current, ids));
    },
    [onDocChange],
  );

  const handleAddLayersToArea = useCallback(
    (areaId: string, ids: string[]) => {
      if (ids.length === 0) return;
      onDocChange(addLayersToGraphAreaInDocument(docRef.current, areaId, ids));
    },
    [onDocChange],
  );

  const handleRemoveLayersFromAreas = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      const next = removeNodesFromAllGraphAreasInDocument(docRef.current, ids);
      if (next !== docRef.current) onDocChange(next);
    },
    [onDocChange],
  );

  const handleRemoveNodesFromArea = useCallback(
    (areaId: string, ids: string[]) => {
      if (ids.length === 0) return;
      onDocChange(removeNodesFromGraphAreaInDocument(docRef.current, areaId, ids));
    },
    [onDocChange],
  );

  const handleRemoveArea = useCallback(
    (areaId: string) => {
      onDocChange(removeGraphAreaInDocument(docRef.current, areaId));
    },
    [onDocChange],
  );

  const handleRenameArea = useCallback(
    (areaId: string, name: string) => {
      onDocChange(renameGraphAreaInDocument(docRef.current, areaId, name));
    },
    [onDocChange],
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
    [onDocChange, onReorderLayers],
  );

  const handleRenameLayer = useCallback(
    (id: string, name: string) => {
      onDocChange(renameLayerInDocument(docRef.current, id, name));
    },
    [onDocChange],
  );

  const handleImageFile = (file: File) => {
    if (!selectedLayer || selectedLayer.kind !== 'image') return;
    const targetLayerId = selectedLayer.id;
    const reader = new FileReader();
    reader.onload = (event) => {
      const src = event.target?.result;
      if (typeof src === 'string') {
        void saveImageAsset(src)
          .then((assetSrc) =>
            onDocChange(replaceSelectedImageSourceInDocument(docRef.current, targetLayerId, assetSrc)),
          )
          .catch(() => onDocChange(replaceSelectedImageSourceInDocument(docRef.current, targetLayerId, src)));
      }
    };
    reader.readAsDataURL(file);
  };

  const toggleEmoji = (layer: EmojiLayer, emoji: string) => {
    if (layer.emojis.includes(emoji) && layer.emojis.length === 1) return;
    const emojis = layer.emojis.includes(emoji)
      ? layer.emojis.filter((item) => item !== emoji)
      : [...layer.emojis, emoji];
    applySelectedPatch<EmojiLayer>({ emojis });
  };

  return (
    <aside className="sidebar">
      {mobileActionBar && <div className="sidebar-mobile-bar">{mobileActionBar}</div>}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border flex-shrink-0">
        <span className="text-dim text-[9px] tracking-widest font-mono mr-1">CANVAS</span>
        {(['1:1', '4:5', '9:16', '16:9'] as AspectRatio[]).map((ratio) => (
          <button
            key={ratio}
            className={`text-[9px] font-mono px-1.5 py-0.5 border rounded-sm tracking-wide transition-colors ${
              (doc.global.aspect ?? '1:1') === ratio
                ? 'border-accent text-accent bg-accent-dim'
                : 'border-border text-dim hover:text-text'
            }`}
            onClick={() => setGlobal('aspect', ratio)}
          >
            {ratio}
          </button>
        ))}
      </div>

      {onGeneratedImageSource && (
        <Section title="AI Image" defaultOpen>
          <AiGenerationPanel aspect={doc.global.aspect ?? '1:1'} onGeneratedImageSource={onGeneratedImageSource} />
        </Section>
      )}

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
          onReorderLayers={handleReorderLayers}
          onToggleVisible={handleToggleVisible}
          onSetLayersVisible={handleSetLayersVisible}
          onCreateAreaFromLayers={handleCreateAreaFromLayers}
          onAddLayersToArea={handleAddLayersToArea}
          onRemoveLayersFromAreas={handleRemoveLayersFromAreas}
          onRemoveNodesFromArea={handleRemoveNodesFromArea}
          onRemoveArea={handleRemoveArea}
          onRenameArea={handleRenameArea}
          onDuplicateLayer={onDuplicateLayer}
          onRenameLayer={handleRenameLayer}
          modeSwitcher={modeSwitcher}
        />
      </div>

      {selectedLayer && (
        <div className="sidebar-sections border-t border-border flex-shrink-0 max-h-[60%]">
          {selectedTargetSummary && <EditorTargetHeader summary={selectedTargetSummary} compact />}
          <Section title={`${selectedLayer.kind.toUpperCase()} LAYER`} defaultOpen>
            <div className="flex justify-between items-center text-dim text-[10px]">
              <span>Visible</span>
              <label className="toggle-switch" aria-label="Toggle layer visibility">
                <input
                  type="checkbox"
                  checked={selectedLayer.visible}
                  onChange={(event) => applySelectedPatch({ visible: event.target.checked } as Partial<Layer>)}
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
                    onChange={(event) => applySelectedPatch<EffectLayer>({ maskAlpha: event.target.checked })}
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
                  onChange={(event) => applySelectedPatch({ locked: event.target.checked } as Partial<Layer>)}
                />
                <span className="toggle-switch__track" />
              </label>
            </div>
          </Section>

          {selectedLayer.kind === 'image' && (
            <Section title="Image Source" defaultOpen hidden={selectedLayer.kind !== 'image'}>
              {selectedLayer.src ? (
                <AssetImagePreview src={selectedLayer.src} />
              ) : (
                <button
                  className="border border-border text-dim h-24 text-[11px] font-mono hover:text-text"
                  onClick={() => fileInputRef.current?.click()}
                >
                  + Add image
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) handleImageFile(file);
                  event.currentTarget.value = '';
                }}
              />
              <ActionButton
                className="h-9 text-[11px]"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const file = event.dataTransfer.files?.[0];
                  if (file) handleImageFile(file);
                }}
                variant="quiet"
              >
                Replace image
              </ActionButton>
            </Section>
          )}

          {selectedLayer.kind === 'emoji' && (
            <Section title="Emoji Set">
              <div className="grid grid-cols-8 gap-1">
                {ALL_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    className={`emoji-btn ${selectedLayer.emojis.includes(emoji) ? 'active' : ''}`}
                    onClick={() => toggleEmoji(selectedLayer, emoji)}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </Section>
          )}

          <LayerControls
            layer={selectedLayer}
            detached
            surface="layers"
            onChange={(patch) => applySelectedPatch(patch as Partial<Layer>)}
          />
        </div>
      )}
    </aside>
  );
}
