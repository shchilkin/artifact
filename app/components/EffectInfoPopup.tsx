import { useEffect, useState } from 'react';
import { EFFECT_META, getEffectFamilyMeta, renderEffectThumb } from '../utils/effectInfo';

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
  const [visible, setVisible] = useState(false);
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);

  // Trigger enter animation after mount (one rAF gives the browser a chance to
  // paint the initial opacity:0 state before the transition fires)
  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

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
    <div
      className={`effect-popup${visible ? ' effect-popup--visible' : ''}`}
      style={{ left, top, width: POPUP_WIDTH }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      role="tooltip"
      aria-label={`${meta.title}: ${meta.description}`}
    >
      <div className="effect-popup__image-wrap">
        {thumbUrl ? (
          <img
            src={thumbUrl}
            alt={`${meta.title} effect preview`}
            className="effect-popup__image"
            width={POPUP_WIDTH}
            height={POPUP_WIDTH}
          />
        ) : (
          <div className="effect-popup__image-placeholder" aria-hidden="true" />
        )}
      </div>
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
    </div>
  );
}
