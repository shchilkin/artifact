import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { render } from '../utils/renderer';
import { buildFilters } from '../utils/pixiFilters';
import { gpuRenderToCanvas } from '../utils/gpuRender';
import { ALL_HERO_FRAMES, type HeroFrame } from '../utils/heroConfigs';

const SIZE = 480;
const FALLBACK_URL = '/hero-fallback.svg';

interface RenderedFrame { url: string; frame: HeroFrame | null; }
const FALLBACK_FRAME: RenderedFrame = { url: FALLBACK_URL, frame: null };

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
  const [frames, setFrames] = useState<RenderedFrame[]>([FALLBACK_FRAME]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [fading, setFading] = useState(false);
  const [hovered, setHovered] = useState(false);
  const framesLenRef = useRef(1);
  const currentIdxRef = useRef(0);
  const allLoadedRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const intervalStartedRef = useRef(false);
  // Tracks seeds already rendered — prevents strict-mode double-invoke duplicates
  const renderedSeedsRef = useRef<Set<number>>(new Set());

  const fadeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    framesLenRef.current = frames.length;
    if (frames.length >= 2 && !intervalStartedRef.current) {
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        intervalStartedRef.current = true;
        intervalRef.current = setInterval(() => {
          const total = framesLenRef.current;
          const current = currentIdxRef.current;
          const next = current + 1;
          let newIdx: number;
          if (allLoadedRef.current) {
            newIdx = next % total;
          } else if (next < total) {
            newIdx = next;
          } else {
            return; // no new frame ready, skip tick
          }
          currentIdxRef.current = newIdx;
          setFading(true);
          fadeTimeoutRef.current = setTimeout(() => {
            setActiveIdx(newIdx);
            setFading(false);
          }, 500);
        }, 2500);
      }
    }
  }, [frames.length]);

  // Clear interval and any pending fade timeout only on real unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (fadeTimeoutRef.current) clearTimeout(fadeTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    // Local cancelled flag — each effect invocation owns its own flag.
    // This prevents the React Strict Mode double-invoke from causing both
    // the first (cancelled) and second (active) loops to write to state.
    let cancelled = false;
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const toRender = prefersReduced ? [ALL_HERO_FRAMES[0]] : ALL_HERO_FRAMES;

    (async () => {
      for (const heroFrame of toRender) {
        if (cancelled) break;
        // Skip seeds already rendered (handles strict-mode double-invoke)
        if (renderedSeedsRef.current.has(heroFrame.seed)) continue;
        renderedSeedsRef.current.add(heroFrame.seed);

        const url = await renderFrameFn(heroFrame);
        if (cancelled) break;

        setFrames(prev => {
          // Replace fallback on first real frame; append thereafter
          if (prev.length === 1 && prev[0] === FALLBACK_FRAME) return [{ url, frame: heroFrame }];
          return [...prev, { url, frame: heroFrame }];
        });
      }
      if (!cancelled) allLoadedRef.current = true;
    })();

    return () => { cancelled = true; };
  }, []);

  const activeFrame = frames[activeIdx];

  function handleClick() {
    if (activeFrame?.frame) {
      navigate(`/app?seed=${activeFrame.frame.seed}&cfg=${encodeURIComponent(JSON.stringify(activeFrame.frame.cfg))}`);
    }
  }

  return (
    <div className="flex flex-col items-start gap-4">
      <div
        className={`hero-cover${activeFrame?.frame ? ' cursor-pointer' : ''}`}
        aria-label="Animated album cover preview"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={handleClick}
      >
        <img
          src={activeFrame?.url ?? FALLBACK_URL}
          alt="Generated album cover"
          className={`hero-cover__img${fading ? ' hero-cover__img--fade' : ''}`}
          width={SIZE}
          height={SIZE}
        />
        {hovered && activeFrame?.frame && (
          <div className="hero-cover__overlay">
            <div className="hero-cover__seed">SEED #{activeFrame.frame.seed}</div>
            <div className="hero-cover__cta">Open in Generator →</div>
          </div>
        )}
      </div>
    </div>
  );
}
