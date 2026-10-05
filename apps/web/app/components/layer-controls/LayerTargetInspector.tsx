import { Button } from '@artifact/ui';
import { useEffect, useRef, useState } from 'react';

import { ALL_EMOJIS, type AspectRatio, type EmojiLayer, type ImageLayer, type Layer } from '../../types/config';
import { isAssetUri, resolveImageSource, saveImageAsset } from '../../utils/assetStore';
import { AiGenerationPanel } from '../AiGenerationPanel';
import { InspectorSection } from '../node-canvas/inspector/fields';
import { LayerControls } from './LayerControls';

/**
 * The inspector for a layer target. Layers and Nodes both render it, so the same layer shows the same sections in
 * the same order in both modes: the layer's source (image file and generation, emoji set), its own control
 * sections, then the shared Layer section.
 */
export function LayerTargetInspector({
  layer,
  aspect,
  onChange,
  onImageSource,
  onLoadModelFile,
}: {
  layer: Layer;
  aspect: AspectRatio;
  /** Applies a patch to this layer. It may be called after an async step, so hosts apply it to the current document. */
  onChange: (patch: Partial<Layer>) => void;
  /** Replaces this image layer's source with a stored image. */
  onImageSource: (src: string) => void;
  onLoadModelFile?: (file: File) => void;
}) {
  return (
    <>
      {layer.kind === 'image' && (
        <>
          <ImageSourceSection key={`source-${layer.id}`} layer={layer} onImageSource={onImageSource} />
          <ImageGenerationSection key={`generate-${layer.id}`} layer={layer} aspect={aspect} onChange={onChange} />
        </>
      )}
      {layer.kind === 'emoji' && <EmojiSetSection key={`emoji-${layer.id}`} layer={layer} onChange={onChange} />}
      {/* The Generate section shows the current prompt, so the image controls do not repeat it. */}
      <LayerControls
        key={layer.id}
        layer={layer}
        detached
        showAiGenerationProvenance={false}
        onChange={onChange}
        onLoadModelFile={onLoadModelFile}
      />
    </>
  );
}

function ImageSourceSection({ layer, onImageSource }: { layer: ImageLayer; onImageSource: (src: string) => void }) {
  const [open, setOpen] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const loadFile = (file: File | undefined) => {
    if (file) void readImageFileSource(file).then(onImageSource);
  };
  return (
    <InspectorSection
      title="Image Source"
      summary={layer.src ? 'Image ready' : 'No image'}
      open={open}
      onToggle={() => setOpen((value) => !value)}
    >
      {layer.src ? (
        <AssetImagePreview src={layer.src} />
      ) : (
        <button type="button" className="image-source-empty-action" onClick={() => inputRef.current?.click()}>
          + Add image
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        aria-label="Image file"
        onChange={(event) => {
          loadFile(event.target.files?.[0]);
          event.currentTarget.value = '';
        }}
      />
      <Button
        className="image-source-replace-action"
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          loadFile(event.dataTransfer.files?.[0]);
        }}
        variant="quiet"
      >
        Choose image file
      </Button>
    </InspectorSection>
  );
}

/** Reads an image file and stores it as an asset; keeps the data URL when the asset store is unavailable. */
function readImageFileSource(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const src = event.target?.result;
      if (typeof src !== 'string') return reject(new Error('Image file could not be read'));
      saveImageAsset(src).then(resolve, () => resolve(src));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
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

function ImageGenerationSection({
  layer,
  aspect,
  onChange,
}: {
  layer: ImageLayer;
  aspect: AspectRatio;
  onChange: (patch: Partial<ImageLayer>) => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <InspectorSection title="Generate" summary="Account gated" open={open} onToggle={() => setOpen((value) => !value)}>
      <AiGenerationPanel
        aspect={aspect}
        generation={layer.aiGeneration}
        generationHistory={layer.aiGenerationHistory}
        generationHistoryIndex={layer.aiGenerationHistoryIndex}
        onGeneratedImageSource={(src, aiGeneration) => onChange(appendAiGenerationVariant(layer, src, aiGeneration))}
        onGenerationStateChange={(aiGeneration) => onChange({ ...seedCurrentAiGenerationVariant(layer), aiGeneration })}
        onGenerationHistorySelect={(index) => {
          const patch = selectAiGenerationVariant(layer, index);
          if (patch) onChange(patch);
        }}
        submitLabel={layer.src ? 'Replace Image' : 'Generate Image'}
        successMessage="Updated image layer."
      />
    </InspectorSection>
  );
}

function appendAiGenerationVariant(
  layer: ImageLayer,
  src: string,
  aiGeneration: NonNullable<ImageLayer['aiGeneration']>,
): Partial<ImageLayer> {
  const existing = getAiGenerationHistorySeed(layer);
  const nextVariant = { src, aiGeneration };
  const nextHistory = [...existing.filter((item) => isDifferentAiVariant(item, src, aiGeneration.jobId)), nextVariant];
  return {
    src,
    aiGeneration,
    aiGenerationHistory: nextHistory,
    aiGenerationHistoryIndex: nextHistory.length - 1,
  };
}

function getAiGenerationHistorySeed(layer: ImageLayer): NonNullable<ImageLayer['aiGenerationHistory']> {
  const history = layer.aiGenerationHistory;
  if (history?.length) return history;
  if (!layer.src || !layer.aiGeneration) return [];
  return [{ src: layer.src, aiGeneration: layer.aiGeneration }];
}

function isDifferentAiVariant(
  item: NonNullable<ImageLayer['aiGenerationHistory']>[number],
  src: string,
  jobId: string | undefined,
) {
  return item.src !== src ? true : item.aiGeneration.jobId !== jobId;
}

function seedCurrentAiGenerationVariant(layer: ImageLayer): Partial<ImageLayer> {
  const { aiGeneration } = layer;
  if (!aiGeneration || layer.aiGenerationHistory?.length || !layer.src) return {};
  return {
    aiGenerationHistory: [{ src: layer.src, aiGeneration }],
    aiGenerationHistoryIndex: 0,
  };
}

function selectAiGenerationVariant(layer: ImageLayer, index: number): Partial<ImageLayer> | null {
  const history = layer.aiGenerationHistory ?? [];
  const nextIndex = Math.min(Math.max(index, 0), history.length - 1);
  const selected = history[nextIndex];
  if (!selected) return null;
  return {
    src: selected.src,
    aiGeneration: selected.aiGeneration,
    aiGenerationHistoryIndex: nextIndex,
  };
}

function EmojiSetSection({ layer, onChange }: { layer: EmojiLayer; onChange: (patch: Partial<EmojiLayer>) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <InspectorSection
      title="Emoji Set"
      summary={`${layer.emojis.length} selected`}
      open={open}
      onToggle={() => setOpen((value) => !value)}
    >
      <div className="grid grid-cols-8 gap-1">
        {ALL_EMOJIS.map((emoji) => {
          const selected = layer.emojis.includes(emoji);
          return (
            <button
              key={emoji}
              type="button"
              aria-pressed={selected}
              className={`emoji-btn ${selected ? 'active' : ''}`}
              onClick={() => onChange({ emojis: nextEmojiSet(layer, emoji) })}
            >
              {emoji}
            </button>
          );
        })}
      </div>
    </InspectorSection>
  );
}

/** Toggles an emoji in the set; the last remaining emoji stays selected. */
function nextEmojiSet(layer: EmojiLayer, emoji: string) {
  if (layer.emojis.includes(emoji)) {
    return layer.emojis.length === 1 ? layer.emojis : layer.emojis.filter((item) => item !== emoji);
  }
  return [...layer.emojis, emoji];
}
