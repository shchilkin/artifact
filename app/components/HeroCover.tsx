import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { render } from '../utils/renderer';
import { buildFilters } from '../utils/pixiFilters';
import { gpuRenderToCanvas } from '../utils/gpuRender';
import { ALL_HERO_FRAMES, generateRandomHeroFrame, type HeroFrame } from '../utils/heroConfigs';

const SIZE = 480;
const FALLBACK_URL = '/hero-fallback.svg';

async function renderFrameFn(frame: HeroFrame): Promise<string> {
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

export function HeroCover() {
  const navigate = useNavigate();
  const [images, setImages] = useState<string[]>([FALLBACK_URL]);
  const [frameData, setFrameData] = useState<(HeroFrame | null)[]>([null]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [fading, setFading] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [allLoaded, setAllLoaded] = useState(false);
  const cancelRef = useRef(false);
  const imagesLenRef = useRef(1);
  const currentIdxRef = useRef(0);
  const allLoadedRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const intervalStartedRef = useRef(false);
  const renderQueue = useRef<HeroFrame[]>([]);
  const renderingRef = useRef(false);

  useEffect(() => {
    imagesLenRef.current = images.length;

    if (images.length >= 2 && !intervalStartedRef.current) {
      const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!prefersReduced) {
        intervalStartedRef.current = true;
        intervalRef.current = setInterval(() => {
          const total = imagesLenRef.current;
          const current = currentIdxRef.current;
          const next = current + 1;

          let newIdx: number;
          if (allLoadedRef.current) {
            newIdx = next % total;
          } else if (next < total) {
            newIdx = next;
          } else {
            return;
          }

          currentIdxRef.current = newIdx;
          setFading(true);
          setTimeout(() => {
            setActiveIdx(newIdx);
            setFading(false);
          }, 500);
        }, 2500);
      }
    }
  }, [images.length]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const drainQueue = useCallback(async () => {
    if (renderingRef.current) return;
    renderingRef.current = true;
    while (renderQueue.current.length > 0) {
      if (cancelRef.current) break;
      const frame = renderQueue.current.shift()!;
      const url = await renderFrameFn(frame);
      if (!cancelRef.current) {
        setImages(prev => [...prev, url]);
        setFrameData(prev => [...prev, frame]);
      }
    }
    if (!cancelRef.current) {
      allLoadedRef.current = true;
      setAllLoaded(true);
    }
    renderingRef.current = false;
  }, []);

  function handleGenerateMore() {
    const newFrames = Array.from({ length: 10 }, () =>
      generateRandomHeroFrame(Math.floor(Math.random() * 900000) + 100000)
    );
    allLoadedRef.current = false;
    setAllLoaded(false);
    renderQueue.current.push(...newFrames);
    drainQueue();
  }

  useEffect(() => {
    cancelRef.current = false;
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const framesToRender = prefersReduced ? [ALL_HERO_FRAMES[0]] : ALL_HERO_FRAMES;

    (async () => {
      for (const frame of framesToRender) {
        if (cancelRef.current) break;
        const url = await renderFrameFn(frame);
        if (!cancelRef.current) {
          setImages(prev => {
            if (prev.length === 1 && prev[0] === FALLBACK_URL) return [url];
            return [...prev, url];
          });
          setFrameData(prev => {
            if (prev.length === 1 && prev[0] === null) return [frame];
            return [...prev, frame];
          });
        }
      }
      if (!cancelRef.current) {
        allLoadedRef.current = true;
        setAllLoaded(true);
      }
    })();

    return () => { cancelRef.current = true; };
  }, []);

  const activeFrame = frameData[activeIdx];

  function handleClick() {
    if (activeFrame) {
      navigate(`/app?seed=${activeFrame.seed}&cfg=${encodeURIComponent(JSON.stringify(activeFrame.cfg))}`);
    }
  }

  return (
    <div className="hero-cover-wrapper">
      <div
        className="hero-cover"
        aria-label="Animated album cover preview"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={handleClick}
        style={{ cursor: activeFrame ? 'pointer' : undefined }}
      >
        <img
          src={images[activeIdx]}
          alt="Generated album cover"
          className={`hero-cover__img${fading ? ' hero-cover__img--fade' : ''}`}
          width={SIZE}
          height={SIZE}
        />
        {hovered && activeFrame && (
          <div className="hero-cover__overlay">
            <div className="hero-cover__seed">SEED #{activeFrame.seed}</div>
            <div className="hero-cover__cta">Open in Generator →</div>
          </div>
        )}
      </div>
      {allLoaded && (
        <button className="btn btn-primary hero-generate-more" onClick={handleGenerateMore}>
          Generate more →
        </button>
      )}
    </div>
  );
}
