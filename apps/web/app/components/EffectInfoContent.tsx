import { useEffect, useState } from 'react';
import { EFFECT_META, getEffectFamilyMeta, renderEffectThumb } from '../utils/effectInfo';

const PREVIEW_SIZE = 240;

/** Help for one effect control: a preview of the effect, what it does, and a sample value. */
export function EffectInfoContent({ effectKey }: { effectKey: string }) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);

  // Load thumbnail lazily; cancel if the help closes before render finishes
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

  return (
    <div className="effect-popup">
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
    </div>
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
          width={PREVIEW_SIZE}
          height={PREVIEW_SIZE}
        />
      ) : (
        <div className="effect-popup__image-placeholder" aria-hidden="true" />
      )}
    </div>
  );
}
