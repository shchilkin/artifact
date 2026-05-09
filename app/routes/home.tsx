import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import type { MetaFunction } from "react-router";
import { useReducedMotion } from "framer-motion";
import { SiteNav } from "../components/SiteNav";
import { Footer } from "../components/Footer";
import { renderDocument } from "../utils/renderer";
import { HERO_FRAMES } from "../utils/heroConfigs";
import {
  DEFAULT_EXPORT,
  makeEffectPresetLayer,
  makeEmojiLayer,
  makeFillLayer,
  makeImageLayer,
  makeTextLayer,
  type CanvasDocument,
  type Layer,
} from "../types/config";
const SEED = 31415;
const CANVAS_PX = 540;
const HERO_IMAGE_SRC = "/girl_image_landing.png";

interface Step {
  title: string;
  body: string;
  layers: Layer[];
}

const STEPS: Step[] = [
  {
    title: "Fill.",
    body: "A tinted plane. Every cover starts here, with one decision about color.",
    layers: [makeFillLayer({ color: "#1a0a1f", name: "fill" })],
  },
  {
    title: "Rays.",
    body: "Light shafts, tinted and angled. One GPU pass over the fill.",
    layers: [makeEffectPresetLayer("rays")],
  },
  {
    title: "Emoji.",
    body: "Glyphs scattered, sized, blurred. Raw material, not punctuation.",
    layers: [
      makeEmojiLayer({
        emojis: ["💀", "⚡", "🥀", "🖤", "✦"],
        density: 24,
        minSz: 22,
        maxSz: 70,
        blur: 62,
        opacity: 75,
        name: "emoji",
      }),
    ],
  },
  {
    title: "Halftone.",
    body: "Print dots eat the emoji into a mechanical pattern.",
    layers: [makeEffectPresetLayer("halftone")],
  },
  {
    title: "Scanlines.",
    body: "CRT bands across the under-layers. Texture of broken signal.",
    layers: [
      {
        ...makeEffectPresetLayer("scanlines"),
        name: "scanlines",
        scanlines: 100,
      },
    ],
  },
  {
    title: "Image.",
    body: "A photo on top of the noise. Crop, scale, drop it in.",
    layers: [
      makeImageLayer(HERO_IMAGE_SRC, {
        fit: "cover",
        opacity: 100,
        name: "image",
      }),
    ],
  },
  {
    title: "Title.",
    body: "Set the name. Display weight, oversized, low in the frame.",
    layers: [
      makeTextLayer({
        content: "WEIRDER",
        font: "DISPLAY",
        size: 140,
        color: "#fff2dc",
        x: 0.5,
        y: 0.82,
        align: "center",
        name: "title",
      }),
    ],
  },
  {
    title: "Grain.",
    body: "Noise across the whole frame. Film texture, not detail.",
    layers: [{ ...makeEffectPresetLayer("grain"), name: "grain", grain: 100 }],
  },
  {
    title: "Misregister.",
    body: "Color channels split, shift apart. Off-press print error, on purpose.",
    layers: [makeEffectPresetLayer("risoShift")],
  },
  {
    title: "Vignette.",
    body: "Corners darkened. Eye pulled to the center.",
    layers: [
      { ...makeEffectPresetLayer("vignette"), name: "vignette", vignette: 50 },
    ],
  },
  {
    title: "Bloom.",
    body: "Highlights leak. Final breath of light. Now export it.",
    layers: [{ ...makeEffectPresetLayer("bloom"), name: "bloom", bloom: 100 }],
  },
];

function buildDoc(stepIndex: number): CanvasDocument {
  const layers = STEPS.slice(0, stepIndex + 1).flatMap((step) => step.layers);
  return {
    global: { bg: "#0a0008", seed: SEED, aspect: "1:1" },
    export: DEFAULT_EXPORT,
    layers,
  };
}

export const meta: MetaFunction = () => [
  { title: "Album Cover Generator | Layer it Up" },
  {
    name: "description",
    content:
      "Stack layers, run GPU effects, export at 3000×3000. A browser-based glitch cover generator for the deliberately strange.",
  },
];

export default function Home() {
  const navigate = useNavigate();
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

  const effectiveStep = step;

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
          return out.toDataURL("image/jpeg", 0.75);
        } catch {
          return null;
        }
      }),
    ).then((results) => {
      setMosaicUrls(results.filter((u): u is string => u !== null));
    });
  }, []);

  // Animated TV-static noise overlay — visible while hero is in view
  useEffect(() => {
    const canvas = noiseCanvasRef.current;
    if (!canvas) return;
    const W = 96;
    const H = 96;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Allocate ImageData once and reuse to avoid per-frame GC pressure
    const img = ctx.createImageData(W, H);
    const d = img.data;

    // Reduced motion: draw one static frame and stop
    if (prefersReducedMotion) {
      for (let i = 0; i < d.length; i += 4) {
        const v = Math.random() * 200;
        d[i] = v;
        d[i + 1] = v;
        d[i + 2] = v;
        d[i + 3] = 200;
      }
      ctx.putImageData(img, 0, 0);
      return;
    }

    let raf: number;
    let frame = 0;

    function draw() {
      const t = frame * 0.018;
      // Slow sine breathe: alpha oscillates between 180 and 220 (out of 255)
      const breathe = 0.5 + 0.5 * Math.sin(t);
      const alpha = Math.floor(180 + 40 * breathe);

      for (let i = 0; i < d.length; i += 4) {
        const v = Math.random() * 220;
        d[i] = v;
        d[i + 1] = v;
        d[i + 2] = v;
        d[i + 3] = alpha;
      }
      ctx!.putImageData(img, 0, 0);
      frame++;
      raf = requestAnimationFrame(draw);
    }

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [prefersReducedMotion]);

  useEffect(() => {
    function update() {
      const refs = stepRefs.current;
      const vh = window.innerHeight;
      if (refs.length) {
        const center = vh * 0.5;
        let bestIdx = 0;
        let bestDist = Infinity;
        for (let i = 0; i < refs.length; i++) {
          const el = refs[i];
          if (!el) continue;
          const r = el.getBoundingClientRect();
          const dist = Math.abs(r.top + r.height * 0.5 - center);
          if (dist < bestDist) {
            bestDist = dist;
            bestIdx = i;
          }
        }
        setStep(bestIdx);
      }
      const hero = heroRef.current;
      if (hero) {
        const r = hero.getBoundingClientRect();
        setHeroVisible(r.bottom > vh * 0.5);
      }
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
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", update);
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
    (async () => {
      const doc = buildDoc(effectiveStep);
      try {
        const out = await renderDocument(
          doc,
          CANVAS_PX,
          CANVAS_PX,
          imageCacheRef.current,
        );
        if (renderTokenRef.current !== token) return;

        // Render to the back canvas (not currently displayed)
        const backIdx: 0 | 1 = frontIdxRef.current === 0 ? 1 : 0;
        const backRef = backIdx === 0 ? canvasARef : canvasBRef;
        const frontRef = frontIdxRef.current === 0 ? canvasARef : canvasBRef;
        const target = backRef.current;
        if (!target) return;
        if (target.width !== out.width) target.width = out.width;
        if (target.height !== out.height) target.height = out.height;
        const ctx = target.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, target.width, target.height);
          ctx.drawImage(out, 0, 0);
        }

        // Crossfade: bring back to front, send front to back
        backRef.current?.classList.remove("home-canvas--back");
        backRef.current?.classList.add("home-canvas--front");
        frontRef.current?.classList.remove("home-canvas--front");
        frontRef.current?.classList.add("home-canvas--back");
        frontIdxRef.current = backIdx;
      } catch {
        // renderer is silent on missing images; nothing to surface
      }
    })();
  }, [effectiveStep, imageReady]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.target instanceof HTMLElement) {
        const tag = event.target.tagName;
        if (
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          event.target.isContentEditable
        )
          return;
      }
      if (event.key === "ArrowDown" || event.key === "PageDown") {
        const target = stepRefs.current[Math.min(step + 1, STEPS.length - 1)];
        if (target) {
          event.preventDefault();
          target.scrollIntoView({
            behavior: prefersReducedMotion ? "auto" : "smooth",
            block: "center",
          });
        }
      } else if (event.key === "ArrowUp" || event.key === "PageUp") {
        const target = stepRefs.current[Math.max(step - 1, 0)];
        if (target) {
          event.preventDefault();
          target.scrollIntoView({
            behavior: prefersReducedMotion ? "auto" : "smooth",
            block: "center",
          });
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, prefersReducedMotion]);

  function handleCTA() {
    const doc = buildDoc(STEPS.length - 1);
    navigate(`/app?doc=${encodeURIComponent(JSON.stringify(doc))}`);
  }

  return (
    <div className="flex flex-col min-h-dvh bg-bg">
      <SiteNav solid />
      <div className="landing-grain" aria-hidden="true" />

      <main className="home-main">
        <div className="home-stage">
          <aside className="home-stage__canvas" aria-label="Live cover preview">
            {mosaicUrls.length > 0 && (
              <div className="home-mosaic" aria-hidden="true">
                {mosaicUrls.map((url, i) => (
                  <img
                    key={i}
                    src={url}
                    alt=""
                    className="home-mosaic__thumb"
                    draggable={false}
                  />
                ))}
              </div>
            )}
            <div className="home-canvas-frame">
              <span
                className="home-canvas-mark home-canvas-mark--tl"
                aria-hidden="true"
              />
              <span
                className="home-canvas-mark home-canvas-mark--tr"
                aria-hidden="true"
              />
              <span
                className="home-canvas-mark home-canvas-mark--bl"
                aria-hidden="true"
              />
              <span
                className="home-canvas-mark home-canvas-mark--br"
                aria-hidden="true"
              />
              <canvas
                ref={canvasARef}
                className="home-canvas--layer home-canvas--front"
                width={CANVAS_PX}
                height={CANVAS_PX}
                aria-label="Album cover preview composing layer by layer"
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
                className={`home-canvas-noise${!heroVisible ? " home-canvas-noise--faded" : ""}`}
                aria-hidden="true"
              />
            </div>
            <div
              className={`home-canvas-meta${heroVisible ? " home-canvas-meta--hidden" : ""}`}
            >
              <span>SEED #{SEED}</span>
              <span>
                {String(step + 1).padStart(2, "0")} /{" "}
                {String(STEPS.length).padStart(2, "0")}
              </span>
            </div>
            <ol className="home-progress" aria-label="Layer progression">
              {STEPS.map((s, i) => (
                <li
                  key={s.title}
                  className={`home-progress__item${i <= step ? " home-progress__item--reached" : ""}${i === step ? " home-progress__item--current" : ""}`}
                  aria-current={i === step ? "step" : undefined}
                >
                  <button
                    className="home-progress__btn"
                    onClick={() => {
                      const target = stepRefs.current[i];
                      if (target)
                        target.scrollIntoView({
                          behavior: prefersReducedMotion ? "auto" : "smooth",
                          block: "center",
                        });
                    }}
                  >
                    <span className="home-progress__bar" aria-hidden="true" />
                    <span className="sr-only">{s.title.replace(".", "")}</span>
                  </button>
                </li>
              ))}
            </ol>
            <div
              className={`home-mobile-dots${heroVisible ? " home-mobile-dots--hidden" : ""}`}
              aria-label="Jump to step"
            >
              {STEPS.map((s, i) => (
                <button
                  key={i}
                  aria-label={`Step ${i + 1}: ${s.title.replace(".", "")}`}
                  aria-current={i === step ? "step" : undefined}
                  className={`home-mobile-dot${i <= step ? " home-mobile-dot--reached" : ""}${i === step ? " home-mobile-dot--current" : ""}`}
                  onClick={() => {
                    const target = stepRefs.current[i];
                    if (target)
                      target.scrollIntoView({
                        behavior: prefersReducedMotion ? "auto" : "smooth",
                        block: "center",
                      });
                  }}
                />
              ))}
            </div>
          </aside>

          <section
            ref={heroRef}
            className={`home-hero-overlay${heroVisible ? "" : " home-hero-overlay--faded"}`}
            aria-labelledby="home-hero-title"
          >
            <p className="home-hero__eyebrow">Album cover generator</p>
            <h1 id="home-hero-title" className="home-hero__headline">
              Stack layers.
              <br />
              Make weirder
              <br />
              covers.
            </h1>
            <p className="home-hero__deck">
              Scroll to watch one cover compose itself, layer by layer.
              Browser-based, GPU-driven, no account.
            </p>
            <div className="home-hero__actions">
              <button
                type="button"
                className="home-hero__skip"
                onClick={handleCTA}
              >
                Open generator →
              </button>
            </div>
            <p
              className={`home-hero__hint${!heroVisible ? " home-hero__hint--used" : ""}`}
              aria-hidden="true"
            >
              ↓ scroll
            </p>
          </section>

          <div className="home-stage__copy">
            {STEPS.map((s, i) => (
              <section
                key={s.title}
                ref={(el) => {
                  stepRefs.current[i] = el;
                }}
                className={`home-step${i === step ? " home-step--active" : ""}`}
                aria-current={i === step ? "step" : undefined}
              >
                <div className="home-step__index">
                  <span className="home-step__num">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="home-step__rule" aria-hidden="true" />
                  <span className="home-step__kind">
                    {layerKindLabel(s.layers)}
                  </span>
                </div>
                <h2 className="home-step__title">{s.title}</h2>
                <p className="home-step__body">{s.body}</p>
              </section>
            ))}

            <section
              ref={ctaRef}
              className={`home-cta-section${ctaVisible ? " home-cta-section--visible" : ""}`}
              aria-labelledby="home-cta-title"
            >
              <p className="home-cta-eyebrow">Your turn</p>
              <h2 id="home-cta-title" className="home-cta-title">
                Open the generator. Make one stranger.
              </h2>
              <div className="home-cta-row">
                <button type="button" className="home-cta" onClick={handleCTA}>
                  Open generator
                  <span aria-hidden="true">→</span>
                </button>
                <Link to="/examples" className="home-cta-link">
                  or browse examples ↗
                </Link>
              </div>
              <p className="home-cta-fineprint">
                Everything is editable once inside. Re-seed or swap any layer.
              </p>
            </section>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}

function layerKindLabel(layers: Layer[]): string {
  const kinds = Array.from(new Set(layers.map((l) => l.kind)));
  return kinds.join(" + ");
}
