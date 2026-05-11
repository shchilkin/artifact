import { FONT_STACKS, type Layer } from '../../../types/config';
import { THUMB_SIZE } from '../constants';

export type LiveMediaLayer = Extract<Layer, { kind: 'text' | 'image' }>;

export function EmptyThumbnailFrame() {
  return (
    <div className="node-thumbnail node-thumbnail-primitive">
      <div className="node-thumbnail-frame" />
    </div>
  );
}

export function LiveMediaOverlay({ layer }: { layer: LiveMediaLayer }) {
  if (layer.kind === 'text') {
    const fontFamily = FONT_STACKS[layer.font] ?? FONT_STACKS.MONO;
    const fontSize = Math.max(6, layer.size * (THUMB_SIZE / 540));
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

  if (layer.fit === 'tile') {
    return (
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            opacity: layer.opacity / 100,
            backgroundImage: `url(${layer.src})`,
            backgroundRepeat: 'repeat',
            backgroundPosition: 'center',
            backgroundSize: `${Math.max(6, THUMB_SIZE * 0.35 * layer.scaleX)}px ${Math.max(6, THUMB_SIZE * 0.35 * layer.scaleY)}px`,
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
          src={layer.src}
          alt=""
          draggable={false}
          style={{
            position: 'absolute',
            left: `${layer.x * 100}%`,
            top: `${layer.y * 100}%`,
            opacity: layer.opacity / 100,
            transform: `translate(-50%, -50%) rotate(${layer.rotation}deg) scale(${(THUMB_SIZE / 540) * layer.scaleX}, ${(THUMB_SIZE / 540) * layer.scaleY})`,
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
        src={layer.src}
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
