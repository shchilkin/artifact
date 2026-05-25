import type { ReactNode } from 'react';
import type { Layer } from '../../../types/config';
import { getCanvasFontStack } from '../../../utils/fontLoading';
import { useNodeCanvasPreview } from '../context';
import { getLiveMediaReferenceScale } from './liveMediaSizing';
import { getNodePreviewSize } from './previewSizing';

export type LiveMediaLayer = Extract<Layer, { kind: 'text' | 'image' }>;
type PreviewSize = ReturnType<typeof getNodePreviewSize>;

function LiveMediaOverlayFrame({ previewSize, children }: { previewSize: PreviewSize; children: ReactNode }) {
  return (
    <div className="node-thumbnail node-live-media-overlay" style={{ minHeight: previewSize.display.height }}>
      <div
        className="node-thumbnail-frame node-live-media-overlay-frame"
        style={{ width: previewSize.display.width, height: previewSize.display.height }}
      >
        {children}
      </div>
    </div>
  );
}

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

export function LiveMediaOverlay({ layer, imageSrc }: { layer: LiveMediaLayer; imageSrc?: string | null }) {
  const { doc } = useNodeCanvasPreview();
  const previewSize = getNodePreviewSize(doc.global.aspect);
  const maxDisplayDimension = Math.max(previewSize.display.width, previewSize.display.height);
  const referenceScale = getLiveMediaReferenceScale(previewSize.display.width);
  if (layer.kind === 'text') {
    const fontFamily = getCanvasFontStack(layer.font);
    const fontSize = Math.max(6, layer.size * referenceScale);
    return (
      <LiveMediaOverlayFrame previewSize={previewSize}>
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
      </LiveMediaOverlayFrame>
    );
  }

  if (!imageSrc) return null;

  if (layer.fit === 'tile') {
    return (
      <LiveMediaOverlayFrame previewSize={previewSize}>
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
      </LiveMediaOverlayFrame>
    );
  }

  if (layer.fit === 'free') {
    return (
      <LiveMediaOverlayFrame previewSize={previewSize}>
        <img
          src={imageSrc}
          alt=""
          draggable={false}
          style={{
            position: 'absolute',
            left: `${layer.x * 100}%`,
            top: `${layer.y * 100}%`,
            maxWidth: 'none',
            maxHeight: 'none',
            opacity: layer.opacity / 100,
            transform: `translate(-50%, -50%) rotate(${layer.rotation}deg) scale(${referenceScale * layer.scaleX}, ${referenceScale * layer.scaleY})`,
            transformOrigin: 'center center',
            userSelect: 'none',
            pointerEvents: 'none',
          }}
        />
      </LiveMediaOverlayFrame>
    );
  }

  const objectFit = layer.fit === 'contain' ? 'contain' : 'cover';
  return (
    <LiveMediaOverlayFrame previewSize={previewSize}>
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
    </LiveMediaOverlayFrame>
  );
}
