import { useEffect, useRef, useState } from 'react';
import { render } from '../utils/renderer';
import { buildFilters } from '../utils/pixiFilters';
import { gpuRenderToCanvas } from '../utils/gpuRender';
import { HERO_FRAMES } from '../utils/heroConfigs';

const SIZE = 480;
const FALLBACK_URL = '/hero-fallback.svg';

export function HeroCover() {
  const [images, setImages] = useState<string[]>([FALLBACK_URL]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [fading, setFading] = useState(false);
  const cancelRef = useRef(false);
  const imagesLenRef = useRef(1);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const intervalStartedRef = useRef(false);

  // Keep ref in sync and start the interval once we have 2+ frames
  useEffect(() => {
    imagesLenRef.current = images.length;

    if (images.length >= 2 && !intervalStartedRef.current) {
      const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!prefersReduced) {
        intervalStartedRef.current = true;
        intervalRef.current = setInterval(() => {
          setFading(true);
          setTimeout(() => {
            setActiveIdx(i => (i + 1) % imagesLenRef.current);
            setFading(false);
          }, 500);
        }, 2500);
      }
    }
  }, [images.length]);

  // Clear interval only on unmount — never on re-render
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

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
        if (!cancelRef.current) {
          setImages(prev => {
            // Replace the SVG fallback with the first real GPU frame; append subsequent frames
            if (prev.length === 1 && prev[0] === FALLBACK_URL) return [url];
            return [...prev, url];
          });
        }
      }
    })();

    return () => { cancelRef.current = true; };
  }, []);

  return (
    <div className="hero-cover" aria-label="Animated album cover preview">
      <img
        src={images[activeIdx]}
        alt="Generated album cover"
        className={`hero-cover__img${fading ? ' hero-cover__img--fade' : ''}`}
        width={SIZE}
        height={SIZE}
      />
    </div>
  );
}
