import { useEffect, useRef, useState } from 'react';
import { render } from '../utils/renderer';
import { buildFilters } from '../utils/pixiFilters';
import { gpuRenderToCanvas } from '../utils/gpuRender';
import { HERO_FRAMES } from '../utils/heroConfigs';

const SIZE = 480;

export function HeroCover() {
  const [images, setImages] = useState<string[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [fading, setFading] = useState(false);
  const cancelRef = useRef(false);

  useEffect(() => {
    cancelRef.current = false;
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    async function renderFrame(frame: typeof HERO_FRAMES[0]): Promise<string> {
      const canvas = document.createElement('canvas');
      canvas.width = SIZE;
      canvas.height = SIZE;
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      render(ctx, SIZE, SIZE, frame.cfg, frame.seed);
      const filters = buildFilters(frame.cfg, frame.seed);
      if (filters) {
        try {
          const out = await gpuRenderToCanvas({ width: SIZE, height: SIZE, source: canvas, filters });
          return out.toDataURL('image/jpeg', 0.85);
        } catch {
          return canvas.toDataURL('image/jpeg', 0.85);
        }
      }
      return canvas.toDataURL('image/jpeg', 0.85);
    }

    const framesToRender = prefersReduced ? [HERO_FRAMES[0]] : HERO_FRAMES;
    (async () => {
      for (const frame of framesToRender) {
        if (cancelRef.current) break;
        const url = await renderFrame(frame);
        if (!cancelRef.current) setImages(prev => [...prev, url]);
      }
    })();

    return () => { cancelRef.current = true; };
  }, []);

  useEffect(() => {
    if (images.length < 2) return;
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;

    const id = setInterval(() => {
      setFading(true);
      setTimeout(() => {
        setActiveIdx(i => (i + 1) % images.length);
        setFading(false);
      }, 500);
    }, 3500);
    return () => clearInterval(id);
  }, [images.length]);

  return (
    <div className="hero-cover" aria-label="Animated album cover preview">
      {images.length === 0 ? (
        <div className="hero-cover__placeholder" aria-hidden="true" />
      ) : (
        <img
          src={images[activeIdx]}
          alt="Generated album cover"
          className={`hero-cover__img${fading ? ' hero-cover__img--fade' : ''}`}
          width={SIZE}
          height={SIZE}
        />
      )}
    </div>
  );
}
