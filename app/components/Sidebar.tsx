import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ALL_EMOJIS,
  type AspectRatio,
  type CanvasDocument,
  type EffectLayer,
  type EffectPreset,
  type EmojiLayer,
  type ImageLayer,
  type Layer,
  type LayerKind,
} from '../types/config';
import { isAssetUri, resolveImageSource, saveImageAsset } from '../utils/assetStore';
import {
  addLayersToGraphAreaInDocument,
  createGraphAreaInDocument,
  renameGraphAreaInDocument,
} from '../utils/documentCommands';
import { LayerPanel } from './LayerPanel';
import { LayerControls } from './layer-controls/LayerControls';

interface Props {
  doc: CanvasDocument;
  onDocChange: (doc: CanvasDocument) => void;
  selectedLayerId: string | null;
  onSelectLayer: (id: string | null) => void;
  onAddLayer: (kind: Exclude<LayerKind, 'effect'>) => void;
  onAddEffectPreset: (preset: EffectPreset) => void;
  onRemoveLayer: (id: string) => void;
  onReorderLayers: (layers: Layer[]) => void;
  onDuplicateLayer: (id: string) => void;
  mobileActionBar?: React.ReactNode;
  modeSwitcher?: React.ReactNode;
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

function updateLayer<T extends Layer>(doc: CanvasDocument, id: string, patch: Partial<T>): CanvasDocument {
  return {
    ...doc,
    layers: doc.layers.map((layer) => (layer.id === id ? { ...layer, ...patch } : layer)),
  };
}

function updateGlobal(doc: CanvasDocument, patch: Partial<CanvasDocument['global']>): CanvasDocument {
  return { ...doc, global: { ...doc.global, ...patch } };
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
  if (!resolvedSrc) return <div className="w-full aspect-square border border-border checkerboard-surface" />;
  return <img src={resolvedSrc} alt="" className="w-full aspect-square object-cover border border-border" />;
}

export function Sidebar({
  doc,
  onDocChange,
  selectedLayerId,
  onSelectLayer,
  onAddLayer,
  onAddEffectPreset,
  onRemoveLayer,
  onReorderLayers,
  onDuplicateLayer,
  mobileActionBar,
  modeSwitcher,
}: Props) {
  const selectedLayer = doc.layers.find((layer) => layer.id === selectedLayerId) ?? null;
  const docRef = useRef(doc);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useLayoutEffect(() => {
    docRef.current = doc;
  }, [doc]);

  const setGlobal = <K extends keyof CanvasDocument['global']>(key: K, value: CanvasDocument['global'][K]) => {
    onDocChange(updateGlobal(doc, { [key]: value }));
  };

  const applySelectedPatch = <T extends Layer>(patch: Partial<T>) => {
    if (!selectedLayer) return;
    onDocChange(updateLayer(doc, selectedLayer.id, patch));
  };

  const handleToggleVisible = useCallback(
    (id: string) => {
      const current = docRef.current;
      onDocChange({
        ...current,
        layers: current.layers.map((layer) => (layer.id === id ? { ...layer, visible: !layer.visible } : layer)),
      });
    },
    [onDocChange],
  );

  const handleSetLayersVisible = useCallback(
    (ids: string[], visible: boolean) => {
      const idSet = new Set(ids);
      const current = docRef.current;
      onDocChange({
        ...current,
        layers: current.layers.map((layer) => (idSet.has(layer.id) ? { ...layer, visible } : layer)),
      });
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

  const handleRenameArea = useCallback(
    (areaId: string, name: string) => {
      onDocChange(renameGraphAreaInDocument(docRef.current, areaId, name));
    },
    [onDocChange],
  );

  const handleRenameLayer = useCallback(
    (id: string, name: string) => {
      const current = docRef.current;
      onDocChange({
        ...current,
        layers: current.layers.map((layer) => (layer.id === id ? { ...layer, name } : layer)),
      });
    },
    [onDocChange],
  );

  const handleImageFile = (file: File) => {
    if (!selectedLayer || selectedLayer.kind !== 'image') return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const src = event.target?.result;
      if (typeof src === 'string') {
        void saveImageAsset(src)
          .then((assetSrc) => applySelectedPatch<ImageLayer>({ src: assetSrc }))
          .catch(() => applySelectedPatch<ImageLayer>({ src }));
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

      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <LayerPanel
          doc={doc}
          selectedLayerId={selectedLayerId}
          onSelectLayer={onSelectLayer}
          onAddLayer={onAddLayer}
          onAddEffectPreset={onAddEffectPreset}
          onRemoveLayer={onRemoveLayer}
          onReorderLayers={onReorderLayers}
          onToggleVisible={handleToggleVisible}
          onSetLayersVisible={handleSetLayersVisible}
          onCreateAreaFromLayers={handleCreateAreaFromLayers}
          onAddLayersToArea={handleAddLayersToArea}
          onRenameArea={handleRenameArea}
          onDuplicateLayer={onDuplicateLayer}
          onRenameLayer={handleRenameLayer}
          modeSwitcher={modeSwitcher}
        />
      </div>

      {selectedLayer && (
        <div className="sidebar-sections border-t border-border flex-shrink-0 max-h-[60%]">
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
              <button
                className="btn h-9 text-[11px]"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const file = event.dataTransfer.files?.[0];
                  if (file) handleImageFile(file);
                }}
              >
                Replace image
              </button>
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
            onChange={(patch) => applySelectedPatch(patch as Partial<Layer>)}
          />
        </div>
      )}
    </aside>
  );
}
