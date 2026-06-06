import { useEffect, useState } from 'react';
import { EFFECT_META, getEffectFamilyMeta, renderEffectThumb } from '../utils/effectInfo';
import { FloatingMenu } from './ui/floating-menu';

const POPUP_WIDTH = 220;
const POPUP_GAP = 12;

interface Props {
  effectKey: string;
  anchorRect: DOMRect;
  sidebarRight: number;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

export function EffectInfoPopup({ effectKey, anchorRect, sidebarRight, onMouseEnter, onMouseLeave }: Props) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);

  // Load thumbnail lazily; cancel if the popup unmounts before render finishes
  useEffect(() => {
    let cancelled = false;
    renderEffectThumb(effectKey).then((url) => {
      if (!cancelled && url) setThumbUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [effectKey]);

  const meta = EFFECT_META[effectKey];
  if (!meta) return null;
  const familyMeta = getEffectFamilyMeta(effectKey);

  // Position to the right of the sidebar, into the canvas area
  const left = sidebarRight + POPUP_GAP;
  const top = Math.max(8, Math.min(anchorRect.top - 8, window.innerHeight - 290));

  return (
    <FloatingMenu
      x={left}
      y={top}
      className="effect-popup effect-popup--visible"
      style={{ width: POPUP_WIDTH }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      role="tooltip"
      aria-label={`${meta.title}: ${meta.description}`}
    >
      <EffectPopupImage thumbUrl={thumbUrl} title={meta.title} />
      <div className="effect-popup__body">
        <span className="effect-popup__title">{meta.title}</span>
        <p className="effect-popup__desc">{meta.description}</p>
        {familyMeta && (
          <span className="effect-popup__family">
            {familyMeta.label} · good for {meta.goodFor ?? familyMeta.goodFor}
          </span>
        )}
        <span className="effect-popup__value">{meta.valueLabel}</span>
      </div>
    </FloatingMenu>
  );
}

function EffectPopupImage({ thumbUrl, title }: { thumbUrl: string | null; title: string }) {
  return (
    <div className="effect-popup__image-wrap">
      {thumbUrl ? (
        <img
          src={thumbUrl}
          alt={`${title} effect preview`}
          className="effect-popup__image"
          width={POPUP_WIDTH}
          height={POPUP_WIDTH}
        />
      ) : (
        <div className="effect-popup__image-placeholder" aria-hidden="true" />
      )}
    </div>
  );
}
