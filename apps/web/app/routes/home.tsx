import { useReducedMotion } from 'framer-motion';
import { type RefObject, useEffect, useRef, useState } from 'react';
import type { MetaFunction } from 'react-router';
import { PublicPageLayout } from '../components/PublicPageLayout';
import { ActionLink } from '../components/ui/ActionButton';
import {
  type CanvasDocument,
  DEFAULT_EXPORT,
  type Layer,
  makeEffectPresetLayer,
  makeEmojiLayer,
  makeFillLayer,
  makeImageLayer,
  makeTextLayer,
} from '../types/config';
import { HERO_FRAMES } from '../utils/heroConfigs';
import { renderDocument } from '../utils/renderer';

const SEED = 31415;
const CANVAS_PX = 540;
const HERO_IMAGE_SRC = '/girl_image_landing.png';
const HERO_DEFAULT_STEP_INDEX = 6;
const HOME_STEP_KEY_DELTA: Record<string, number> = {
  ArrowDown: 1,
  PageDown: 1,
  ArrowUp: -1,
  PageUp: -1,
};
const HOME_EDITABLE_KEY_TARGETS = new Set(['INPUT', 'TEXTAREA']);

interface Step {
  title: string;
  body: string;
  layers: Layer[];
}

const STEPS: Step[] = [
  {
    title: 'Fill.',
    body: 'A tinted plane. Every cover starts with one decision about color.',
    layers: [makeFillLayer({ color: '#1a0a1f', name: 'fill' })],
  },
  {
    title: 'Rays.',
    body: 'Light shafts, tinted and angled. One GPU pass over the fill.',
    layers: [makeEffectPresetLayer('rays')],
  },
  {
    title: 'Symbols.',
    body: 'Glyphs scattered, sized, blurred. Raw material, not punctuation.',
    layers: [
      makeEmojiLayer({
        emojis: ['💀', '⚡', '🥀', '🖤', '✦'],
        density: 24,
        minSz: 22,
        maxSz: 70,
        blur: 62,
        opacity: 75,
        name: 'emoji',
      }),
    ],
  },
  {
    title: 'Halftone.',
    body: 'Print dots eat the source into a mechanical pattern.',
    layers: [makeEffectPresetLayer('halftone')],
  },
  {
    title: 'Scanlines.',
    body: 'CRT bands across the under-layers. Texture of broken signal.',
    layers: [
      makeEffectPresetLayer('scanlines', {
        scanlines: 100,
      }),
    ],
  },
  {
    title: 'Image.',
    body: 'A photo on top of the noise. Crop, scale, drop it in.',
    layers: [
      makeImageLayer(HERO_IMAGE_SRC, {
        fit: 'cover',
        opacity: 100,
        name: 'image',
      }),
    ],
  },
  {
    title: 'Title.',
    body: 'Set the name. Display weight, oversized, low in the frame.',
    layers: [
      makeTextLayer({
        content: 'ARTIFACT',
        font: 'DISPLAY',
        size: 126,
        color: '#fff2dc',
        x: 0.5,
        y: 0.82,
        align: 'center',
        name: 'title',
      }),
    ],
  },
  {
    title: 'Grain.',
    body: 'Noise across the whole frame. Film texture, not detail.',
    layers: [makeEffectPresetLayer('grain', { value: 100 })],
  },
  {
    title: 'Misregister.',
    body: 'Color channels split, shift apart. Off-press print error under your control.',
    layers: [makeEffectPresetLayer('risoShift')],
  },
  {
    title: 'Vignette.',
    body: 'Corners darkened. Eye pulled to the center.',
    layers: [makeEffectPresetLayer('vignette', { value: 50 })],
  },
  {
    title: 'Bloom.',
    body: 'Highlights leak. Final breath of light. Now export it.',
    layers: [makeEffectPresetLayer('bloom', { value: 100 })],
  },
];

function buildDoc(stepIndex: number): CanvasDocument {
  const layers = STEPS.slice(0, stepIndex + 1).flatMap((step) => step.layers);
  return {
    global: { bg: '#0a0008', seed: SEED, aspect: '1:1' },
    export: DEFAULT_EXPORT,
    layers,
  };
}

export const meta: MetaFunction = () => [
  { title: 'Artifact | Local-first Cover Art Editor' },
  {
    name: 'description',
    content:
      'Artifact is a local-first creative editor for cover art, posters, type, texture, effects, nodes, local projects, and clean raster export.',
  },
];

function nearestHomeStepIndex(refs: Array<HTMLElement | null>, viewportHeight: number) {
  if (!refs.length) return null;
  const center = viewportHeight * 0.5;
  return refs.reduce(
    (best, el, index) => {
      const distance = homeStepDistanceFromCenter(el, center);
      return distance < best.distance ? { index, distance } : best;
    },
    { index: 0, distance: Infinity },
  ).index;
}

function homeStepDistanceFromCenter(el: HTMLElement | null, center: number) {
  if (!el) return Infinity;
  const rect = el.getBoundingClientRect();
  return Math.abs(rect.top + rect.height * 0.5 - center);
}

function homeHeroVisible(hero: HTMLElement | null, viewportHeight: number) {
  if (!hero) return false;
  return hero.getBoundingClientRect().bottom > viewportHeight * 0.5;
}

async function renderHomeHeroStep({
  canvasARef,
  canvasBRef,
  effectiveStep,
  frontIdxRef,
  imageCache,
  renderTokenRef,
  token,
}: {
  canvasARef: RefObject<HTMLCanvasElement | null>;
  canvasBRef: RefObject<HTMLCanvasElement | null>;
  effectiveStep: number;
  frontIdxRef: RefObject<0 | 1>;
  imageCache: Map<string, HTMLImageElement>;
  renderTokenRef: RefObject<number>;
  token: number;
}) {
  try {
    const out = await renderDocument(buildDoc(effectiveStep), CANVAS_PX, CANVAS_PX, imageCache);
    if (renderTokenRef.current !== token) return;
    swapHomeHeroCanvas(out, canvasARef, canvasBRef, frontIdxRef);
  } catch {
    // renderer is silent on missing images; nothing to surface
  }
}

function swapHomeHeroCanvas(
  out: HTMLCanvasElement,
  canvasARef: RefObject<HTMLCanvasElement | null>,
  canvasBRef: RefObject<HTMLCanvasElement | null>,
  frontIdxRef: RefObject<0 | 1>,
) {
  const backIdx = oppositeHomeCanvasIndex(frontIdxRef.current);
  const refs = [canvasARef, canvasBRef] as const;
  const backRef = refs[backIdx];
  const frontRef = refs[frontIdxRef.current];
  const target = backRef.current;
  if (!target) return;
  drawHomeHeroCanvas(target, out);
  showHomeHeroBackCanvas(backRef.current, frontRef.current);
  frontIdxRef.current = backIdx;
}

function oppositeHomeCanvasIndex(index: 0 | 1): 0 | 1 {
  return index === 0 ? 1 : 0;
}

function drawHomeHeroCanvas(target: HTMLCanvasElement, out: HTMLCanvasElement) {
  if (target.width !== out.width) target.width = out.width;
  if (target.height !== out.height) target.height = out.height;
  const ctx = target.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, target.width, target.height);
  ctx.drawImage(out, 0, 0);
}

function showHomeHeroBackCanvas(back: HTMLCanvasElement | null, front: HTMLCanvasElement | null) {
  back?.classList.remove('home-canvas--back');
  back?.classList.add('home-canvas--front');
  front?.classList.remove('home-canvas--front');
  front?.classList.add('home-canvas--back');
}

function handleHomeStepKey(
  event: KeyboardEvent,
  refs: Array<HTMLElement | null>,
  step: number,
  prefersReducedMotion: boolean | null,
) {
  if (isHomeEditableKeyTarget(event.target)) return;
  const target = homeStepKeyTarget(refs, step, event.key);
  if (!target) return;
  event.preventDefault();
  target.scrollIntoView({
    behavior: prefersReducedMotion ? 'auto' : 'smooth',
    block: 'center',
  });
}

function homeStepKeyTarget(refs: Array<HTMLElement | null>, step: number, key: string) {
  const delta = HOME_STEP_KEY_DELTA[key] ?? 0;
  if (!delta) return null;
  return refs[clampedHomeStepIndex(step + delta)] ?? null;
}

function clampedHomeStepIndex(index: number) {
  return Math.max(0, Math.min(index, STEPS.length - 1));
}

function isHomeEditableKeyTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && (HOME_EDITABLE_KEY_TARGETS.has(target.tagName) || target.isContentEditable);
}

function setupHomeNoiseCanvas(canvas: HTMLCanvasElement | null, prefersReducedMotion: boolean | null) {
  const context = createHomeNoiseContext(canvas);
  if (!context) return undefined;
  if (prefersReducedMotion) {
    drawHomeNoiseFrame(context, 200, 200);
    return undefined;
  }
  return animateHomeNoise(context);
}

function createHomeNoiseContext(canvas: HTMLCanvasElement | null) {
  if (!canvas) return null;
  const size = { width: 96, height: 96 };
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  return {
    ctx,
    data: ctx.createImageData(size.width, size.height),
  };
}

function animateHomeNoise(context: { ctx: CanvasRenderingContext2D; data: ImageData }) {
  let raf: number;
  let frame = 0;
  const draw = () => {
    const breathe = 0.5 + 0.5 * Math.sin(frame * 0.018);
    drawHomeNoiseFrame(context, 220, Math.floor(180 + 40 * breathe));
    frame += 1;
    raf = requestAnimationFrame(draw);
  };
  raf = requestAnimationFrame(draw);
  return () => cancelAnimationFrame(raf);
}

function drawHomeNoiseFrame(
  { ctx, data }: { ctx: CanvasRenderingContext2D; data: ImageData },
  maxValue: number,
  alpha: number,
) {
  const pixels = data.data;
  for (let i = 0; i < pixels.length; i += 4) {
    const value = Math.random() * maxValue;
    pixels[i] = value;
    pixels[i + 1] = value;
    pixels[i + 2] = value;
    pixels[i + 3] = alpha;
  }
  ctx.putImageData(data, 0, 0);
}

export default function Home() {
  const prefersReducedMotion = useReducedMotion();

  const [step, setStep] = useState(0);
  const [imageReady, setImageReady] = useState(false);
  const [heroVisible, setHeroVisible] = useState(true);
  const [mosaicUrls, setMosaicUrls] = useState<string[]>([]);
  const [ctaVisible, setCtaVisible] = useState(false);
  const stepRefs = useRef<Array<HTMLElement | null>>([]);
  const heroRef = useRef<HTMLElement | null>(null);
  const ctaRef = useRef<HTMLElement | null>(null);
  const canvasARef = useRef<HTMLCanvasElement>(null);
  const canvasBRef = useRef<HTMLCanvasElement>(null);
  const noiseCanvasRef = useRef<HTMLCanvasElement>(null);
  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const renderTokenRef = useRef(0);
  // Track which canvas is currently displayed (0 = A, 1 = B)
  const frontIdxRef = useRef<0 | 1>(0);

  const effectiveStep = heroVisible ? HERO_DEFAULT_STEP_INDEX : step;
  const registerStepRef = (index: number, element: HTMLElement | null) => {
    stepRefs.current[index] = element;
  };

  useEffect(() => {
    const img = new Image();
    img.src = HERO_IMAGE_SRC;
    const finish = () => {
      imageCacheRef.current.set(HERO_IMAGE_SRC, img);
      setImageReady(true);
    };
    if (img.complete && img.naturalWidth > 0) {
      finish();
    } else {
      img.onload = finish;
      img.onerror = () => setImageReady(true);
    }
  }, []);

  // Render mosaic thumbnails from HERO_FRAMES in the background
  useEffect(() => {
    const emptyCache = new Map<string, HTMLImageElement>();
    const THUMB = 200;
    Promise.all(
      HERO_FRAMES.map(async ({ doc }) => {
        try {
          const out = await renderDocument(doc, THUMB, THUMB, emptyCache);
          return out.toDataURL('image/jpeg', 0.75);
        } catch {
          return null;
        }
      }),
    ).then((results) => {
      setMosaicUrls(results.filter((u): u is string => u !== null));
    });
  }, []);

  useEffect(() => {
    return setupHomeNoiseCanvas(noiseCanvasRef.current, prefersReducedMotion);
  }, [prefersReducedMotion]);

  useEffect(() => {
    function update() {
      const vh = window.innerHeight;
      const nextStep = nearestHomeStepIndex(stepRefs.current, vh);
      if (nextStep !== null) setStep(nextStep);
      setHeroVisible(homeHeroVisible(heroRef.current, vh));
    }
    update();
    // rAF-throttle the scroll handler so layout reads don't pile up
    let pending = false;
    function onScroll() {
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => {
        update();
        pending = false;
      });
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', update);
    };
  }, []);

  // Reveal CTA section when it enters the viewport
  useEffect(() => {
    const el = ctaRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setCtaVisible(true);
      },
      { threshold: 0.12 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!imageReady) return;
    const token = ++renderTokenRef.current;
    void renderHomeHeroStep({
      canvasARef,
      canvasBRef,
      effectiveStep,
      frontIdxRef,
      imageCache: imageCacheRef.current,
      renderTokenRef,
      token,
    });
  }, [effectiveStep, imageReady]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      handleHomeStepKey(event, stepRefs.current, step, prefersReducedMotion);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step, prefersReducedMotion]);

  return (
    <PublicPageLayout className="product-discovery-route">
      <div className="landing-grain" aria-hidden="true" />

      <main className="home-main">
        <div className="home-stage">
          <HomeCanvasAside
            canvasARef={canvasARef}
            canvasBRef={canvasBRef}
            heroVisible={heroVisible}
            mosaicUrls={mosaicUrls}
            noiseCanvasRef={noiseCanvasRef}
            prefersReducedMotion={prefersReducedMotion}
            step={step}
            stepRefs={stepRefs}
          />
          <HomeHeroOverlay heroRef={heroRef} heroVisible={heroVisible} />
          <HomeStageCopy ctaRef={ctaRef} ctaVisible={ctaVisible} step={step} onStepRef={registerStepRef} />
        </div>
      </main>
    </PublicPageLayout>
  );
}

function HomeCanvasAside({
  canvasARef,
  canvasBRef,
  heroVisible,
  mosaicUrls,
  noiseCanvasRef,
  prefersReducedMotion,
  step,
  stepRefs,
}: {
  canvasARef: RefObject<HTMLCanvasElement | null>;
  canvasBRef: RefObject<HTMLCanvasElement | null>;
  heroVisible: boolean;
  mosaicUrls: string[];
  noiseCanvasRef: RefObject<HTMLCanvasElement | null>;
  prefersReducedMotion: boolean | null;
  step: number;
  stepRefs: RefObject<Array<HTMLElement | null>>;
}) {
  return (
    <aside className="home-stage__canvas" aria-label="Live cover preview">
      <HomeMosaic urls={mosaicUrls} />
      <HomeCanvasFrame
        canvasARef={canvasARef}
        canvasBRef={canvasBRef}
        heroVisible={heroVisible}
        noiseCanvasRef={noiseCanvasRef}
      />
      <HomeCanvasMeta heroVisible={heroVisible} step={step} />
      <HomeProgressNav prefersReducedMotion={prefersReducedMotion} step={step} stepRefs={stepRefs} />
      <HomeMobileDots
        heroVisible={heroVisible}
        prefersReducedMotion={prefersReducedMotion}
        step={step}
        stepRefs={stepRefs}
      />
    </aside>
  );
}

function HomeMosaic({ urls }: { urls: string[] }) {
  if (urls.length === 0) return null;
  return (
    <div className="home-mosaic" aria-hidden="true">
      {urls.map((url, i) => (
        <img key={i} src={url} alt="" className="home-mosaic__thumb" draggable={false} />
      ))}
    </div>
  );
}

function HomeCanvasFrame({
  canvasARef,
  canvasBRef,
  heroVisible,
  noiseCanvasRef,
}: {
  canvasARef: RefObject<HTMLCanvasElement | null>;
  canvasBRef: RefObject<HTMLCanvasElement | null>;
  heroVisible: boolean;
  noiseCanvasRef: RefObject<HTMLCanvasElement | null>;
}) {
  return (
    <div className="home-canvas-frame">
      <span className="home-canvas-mark home-canvas-mark--tl" aria-hidden="true" />
      <span className="home-canvas-mark home-canvas-mark--tr" aria-hidden="true" />
      <span className="home-canvas-mark home-canvas-mark--bl" aria-hidden="true" />
      <span className="home-canvas-mark home-canvas-mark--br" aria-hidden="true" />
      <canvas
        ref={canvasARef}
        className="home-canvas--layer home-canvas--front"
        width={CANVAS_PX}
        height={CANVAS_PX}
        aria-label="Album cover preview composing layer by layer"
        role="img"
      />
      <canvas
        ref={canvasBRef}
        className="home-canvas--layer home-canvas--back"
        width={CANVAS_PX}
        height={CANVAS_PX}
        aria-hidden="true"
      />
      <canvas
        ref={noiseCanvasRef}
        className={`home-canvas-noise${!heroVisible ? ' home-canvas-noise--faded' : ''}`}
        aria-hidden="true"
      />
    </div>
  );
}

function HomeCanvasMeta({ heroVisible, step }: { heroVisible: boolean; step: number }) {
  return (
    <div className={`home-canvas-meta${heroVisible ? ' home-canvas-meta--hidden' : ''}`}>
      <span>SEED #{SEED}</span>
      <span>
        {String(step + 1).padStart(2, '0')} / {String(STEPS.length).padStart(2, '0')}
      </span>
    </div>
  );
}

function HomeProgressNav({
  prefersReducedMotion,
  step,
  stepRefs,
}: {
  prefersReducedMotion: boolean | null;
  step: number;
  stepRefs: RefObject<Array<HTMLElement | null>>;
}) {
  return (
    <ol className="home-progress" aria-label="Layer progression">
      {STEPS.map((s, i) => (
        <li
          key={s.title}
          className={`home-progress__item${i <= step ? ' home-progress__item--reached' : ''}${i === step ? ' home-progress__item--current' : ''}`}
          aria-current={i === step ? 'step' : undefined}
        >
          <button className="home-progress__btn" onClick={() => scrollToHomeStep(stepRefs, i, prefersReducedMotion)}>
            <span className="home-progress__bar" aria-hidden="true" />
            <span className="sr-only">{s.title.replace('.', '')}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}

function HomeMobileDots({
  heroVisible,
  prefersReducedMotion,
  step,
  stepRefs,
}: {
  heroVisible: boolean;
  prefersReducedMotion: boolean | null;
  step: number;
  stepRefs: RefObject<Array<HTMLElement | null>>;
}) {
  return (
    <div className={`home-mobile-dots${heroVisible ? ' home-mobile-dots--hidden' : ''}`} aria-label="Jump to step">
      {STEPS.map((s, i) => (
        <button
          key={i}
          aria-label={`Step ${i + 1}: ${s.title.replace('.', '')}`}
          aria-current={i === step ? 'step' : undefined}
          className={`home-mobile-dot${i <= step ? ' home-mobile-dot--reached' : ''}${i === step ? ' home-mobile-dot--current' : ''}`}
          onClick={() => scrollToHomeStep(stepRefs, i, prefersReducedMotion)}
        />
      ))}
    </div>
  );
}

function scrollToHomeStep(
  stepRefs: RefObject<Array<HTMLElement | null>>,
  index: number,
  prefersReducedMotion: boolean | null,
) {
  stepRefs.current[index]?.scrollIntoView({
    behavior: prefersReducedMotion ? 'auto' : 'smooth',
    block: 'center',
  });
}

function HomeHeroOverlay({ heroRef, heroVisible }: { heroRef: RefObject<HTMLElement | null>; heroVisible: boolean }) {
  return (
    <section
      ref={heroRef}
      className={`home-hero-overlay${heroVisible ? '' : ' home-hero-overlay--faded'}`}
      aria-labelledby="home-hero-title"
    >
      <p className="home-hero__eyebrow">Artifact editor</p>
      <h1 id="home-hero-title" className="home-hero__headline">
        Stack layers.
        <br />
        Shape covers.
      </h1>
      <p className="home-hero__deck">
        Scroll to watch one cover compose itself, layer by layer. Open the editor blank when you are ready to make your
        own.
      </p>
      <div className="home-hero__actions">
        <ActionLink to="/app?new=blank" variant="primary">
          Open editor
        </ActionLink>
        <ActionLink to="/showcase" variant="quiet">
          View showcase
        </ActionLink>
      </div>
      <p className={`home-hero__hint${!heroVisible ? ' home-hero__hint--used' : ''}`} aria-hidden="true">
        ↓ scroll
      </p>
    </section>
  );
}

function HomeStageCopy({
  ctaRef,
  ctaVisible,
  onStepRef,
  step,
}: {
  ctaRef: RefObject<HTMLElement | null>;
  ctaVisible: boolean;
  onStepRef: (index: number, element: HTMLElement | null) => void;
  step: number;
}) {
  return (
    <div className="home-stage__copy">
      {STEPS.map((s, i) => (
        <HomeStepSection key={s.title} index={i} step={s} active={i === step} onStepRef={onStepRef} />
      ))}
      <HomeCtaSection ctaRef={ctaRef} ctaVisible={ctaVisible} />
    </div>
  );
}

function HomeStepSection({
  active,
  index,
  onStepRef,
  step,
}: {
  active: boolean;
  index: number;
  onStepRef: (index: number, element: HTMLElement | null) => void;
  step: Step;
}) {
  return (
    <section
      ref={(el) => {
        onStepRef(index, el);
      }}
      className={`home-step${active ? ' home-step--active' : ''}`}
      aria-current={active ? 'step' : undefined}
    >
      <div className="home-step__index">
        <span className="home-step__num">{String(index + 1).padStart(2, '0')}</span>
        <span className="home-step__rule" aria-hidden="true" />
        <span className="home-step__kind">{layerKindLabel(step.layers)}</span>
      </div>
      <h2 className="home-step__title">{step.title}</h2>
      <p className="home-step__body">{step.body}</p>
    </section>
  );
}

function HomeCtaSection({ ctaRef, ctaVisible }: { ctaRef: RefObject<HTMLElement | null>; ctaVisible: boolean }) {
  return (
    <section
      ref={ctaRef}
      className={`home-cta-section${ctaVisible ? ' home-cta-section--visible' : ''}`}
      aria-labelledby="home-cta-title"
    >
      <p className="home-cta-eyebrow">Your turn</p>
      <h2 id="home-cta-title" className="home-cta-title">
        Open the editor. Start from a blank document.
      </h2>
      <div className="home-cta-row">
        <ActionLink to="/app?new=blank" variant="primary">
          Open editor
          <span aria-hidden="true">→</span>
        </ActionLink>
        <ActionLink to="/showcase" variant="quiet">
          view showcase
        </ActionLink>
      </div>
      <p className="home-cta-fineprint">
        The default editor opens empty. Add sources, stack layers, route nodes, and export when the piece is ready.
      </p>
    </section>
  );
}

function layerKindLabel(layers: Layer[]): string {
  const kinds = Array.from(new Set(layers.map((l) => l.kind)));
  return kinds.join(' + ');
}
