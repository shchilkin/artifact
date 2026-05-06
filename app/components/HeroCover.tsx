import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { renderDocument } from '../utils/renderer';
import { ALL_HERO_FRAMES, type HeroFrame } from '../utils/heroConfigs';

const SIZE = 480;
const FALLBACK_URL = '/hero-fallback.svg';

interface RenderedFrame {
  url: string;
  frame: HeroFrame | null;
}

const FALLBACK_FRAME: RenderedFrame = { url: FALLBACK_URL, frame: null };

async function renderFrameFn(frame: HeroFrame): Promise<string> {
  const canvas = await renderDocument(frame.doc, SIZE, SIZE, new Map());
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
  const renderedSeedsRef = useRef<Set<number>>(new Set());
  const fadeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    framesLenRef.current = frames.length;
    if (frames.length >= 2 && !intervalStartedRef.current && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      intervalStartedRef.current = true;
      intervalRef.current = setInterval(() => {
        const total = framesLenRef.current;
        const current = currentIdxRef.current;
        const next = current + 1;
        let newIdx: number;
        if (allLoadedRef.current) newIdx = next % total;
        else if (next < total) newIdx = next;
        else return;
        currentIdxRef.current = newIdx;
        setFading(true);
        fadeTimeoutRef.current = setTimeout(() => {
          setActiveIdx(newIdx);
          setFading(false);
        }, 500);
      }, 2500);
    }
  }, [frames.length]);

  useEffect(() => () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (fadeTimeoutRef.current) clearTimeout(fadeTimeoutRef.current);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const toRender = prefersReduced ? [ALL_HERO_FRAMES[0]] : ALL_HERO_FRAMES;

    (async () => {
      for (const heroFrame of toRender) {
        if (cancelled) break;
        const seed = heroFrame.doc.global.seed;
        if (renderedSeedsRef.current.has(seed)) continue;
        renderedSeedsRef.current.add(seed);
        const url = await renderFrameFn(heroFrame);
        if (cancelled) break;
        setFrames((prev) => {
          if (prev.length === 1 && prev[0] === FALLBACK_FRAME) return [{ url, frame: heroFrame }];
          return [...prev, { url, frame: heroFrame }];
        });
      }
      if (!cancelled) allLoadedRef.current = true;
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const activeFrame = frames[activeIdx];

  function handleClick() {
    if (activeFrame?.frame) {
      navigate(`/app?doc=${encodeURIComponent(JSON.stringify(activeFrame.frame.doc))}`);
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
        <img src={activeFrame?.url ?? FALLBACK_URL} alt="Generated album cover" className={`hero-cover__img${fading ? ' hero-cover__img--fade' : ''}`} width={SIZE} height={SIZE} />
        {hovered && activeFrame?.frame && (
          <div className="hero-cover__overlay">
            <div className="hero-cover__seed">SEED #{activeFrame.frame.doc.global.seed}</div>
            <div className="hero-cover__cta">Open in Generator →</div>
          </div>
        )}
      </div>
    </div>
  );
}
