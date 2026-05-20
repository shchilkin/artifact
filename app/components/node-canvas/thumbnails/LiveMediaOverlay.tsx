import { FONT_STACKS, type Layer } from '../../../types/config';
import { isAssetUri } from '../../../utils/assetStore';
import { useNodeCanvasPreview } from '../context';
import { getLiveMediaReferenceScale } from './liveMediaSizing';
import { getNodePreviewSize } from './previewSizing';

export type LiveMediaLayer = Extract<Layer, { kind: 'text' | 'image' }>;

export function EmptyThumbnailFrame({ label }: { label?: string }) {
  const { doc } = useNodeCanvasPreview();
  const previewSize = getNodePreviewSize(doc.global.aspect);
  return (
    <div className="node-thumbnail node-thumbnail-primitive" style={{ minHeight: previewSize.display.height }}>
      <div
        className="node-thumbnail-frame checkerboard-surface"
        style={{ width: previewSize.display.width, height: previewSize.display.height }}
      >
        {label && <div className="node-thumbnail-empty-label">{label}</div>}
      </div>
    </div>
  );
}

export function LiveMediaOverlay({ layer }: { layer: LiveMediaLayer }) {
  const { doc, imageCache } = useNodeCanvasPreview();
  const previewSize = getNodePreviewSize(doc.global.aspect);
  const maxDisplayDimension = Math.max(previewSize.display.width, previewSize.display.height);
  const referenceScale = getLiveMediaReferenceScale(previewSize.display.width);
  if (layer.kind === 'text') {
    const fontFamily = FONT_STACKS[layer.font] ?? FONT_STACKS.MONO;
    const fontSize = Math.max(6, layer.size * referenceScale);
    return (
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        <div
          style={{
            position: 'absolute',
            left: `${layer.x * 100}%`,
            top: `${layer.y * 100}%`,
            width: '92%',
            color: layer.color,
            opacity: layer.opacity / 100,
            fontFamily,
            fontSize,
            lineHeight: 1.25,
            textAlign: layer.align,
            whiteSpace: 'pre-wrap',
            overflowWrap: 'break-word',
            transform: `translate(-50%, -50%) rotate(${layer.rotation}deg) scale(${layer.scaleX}, ${layer.scaleY})`,
            transformOrigin: 'center center',
          }}
        >
          {layer.content}
        </div>
      </div>
    );
  }

  if (!layer.src) return null;
  const imageSrc = imageCache.get(layer.src)?.src ?? layer.src;
  if (isAssetUri(imageSrc)) return null;

  if (layer.fit === 'tile') {
    return (
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            opacity: layer.opacity / 100,
            backgroundImage: `url(${imageSrc})`,
            backgroundRepeat: 'repeat',
            backgroundPosition: 'center',
            backgroundSize: `${Math.max(6, maxDisplayDimension * 0.35 * layer.scaleX)}px ${Math.max(6, maxDisplayDimension * 0.35 * layer.scaleY)}px`,
            transform: `rotate(${layer.rotation}deg) translate(${(layer.x - 0.5) * 100}%, ${(layer.y - 0.5) * 100}%)`,
            transformOrigin: 'center center',
          }}
        />
      </div>
    );
  }

  if (layer.fit === 'free') {
    return (
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        <img
          src={imageSrc}
          alt=""
          draggable={false}
          style={{
            position: 'absolute',
            left: `${layer.x * 100}%`,
            top: `${layer.y * 100}%`,
            opacity: layer.opacity / 100,
            transform: `translate(-50%, -50%) rotate(${layer.rotation}deg) scale(${referenceScale * layer.scaleX}, ${referenceScale * layer.scaleY})`,
            transformOrigin: 'center center',
            userSelect: 'none',
            pointerEvents: 'none',
          }}
        />
      </div>
    );
  }

  const objectFit = layer.fit === 'contain' ? 'contain' : 'cover';
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      <img
        src={imageSrc}
        alt=""
        draggable={false}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit,
          objectPosition: 'center',
          opacity: layer.opacity / 100,
          transform: `translate(${(layer.x - 0.5) * 100}%, ${(layer.y - 0.5) * 100}%) rotate(${layer.rotation}deg) scale(${layer.scaleX}, ${layer.scaleY})`,
          transformOrigin: 'center center',
          userSelect: 'none',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}
