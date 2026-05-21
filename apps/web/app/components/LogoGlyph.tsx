import { useLayoutEffect, useRef } from 'react';
import { ALL_EMOJIS } from '../types/config';

const DISPLAY = 32;

export function LogoGlyph() {
  const wrapRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    let cancelled = false;
    let cleanupVariant: (() => void) | undefined;
    let pixiRenderer: import('pixi.js').Renderer | undefined;

    const emoji = ALL_EMOJIS[Math.floor(Math.random() * ALL_EMOJIS.length)];
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    Promise.all([import('pixi.js'), import('../utils/logoVariants')]).then(
      ([{ Renderer, Container }, { RENDER, VARIANTS }]) => {
        if (cancelled) return;

        const variant = VARIANTS[Math.floor(Math.random() * VARIANTS.length)];

        let renderer: import('pixi.js').Renderer;
        try {
          renderer = new Renderer({
            width: RENDER,
            height: RENDER,
            backgroundAlpha: 0,
            antialias: false,
          });
        } catch {
          return;
        }

        pixiRenderer = renderer;
        const canvas = renderer.view as HTMLCanvasElement;
        canvas.style.cssText = `display:block;width:${DISPLAY}px;height:${DISPLAY}px;image-rendering:pixelated;`;
        wrap.appendChild(canvas);

        const stage = new Container();
        cleanupVariant = variant(stage, renderer, emoji, reducedMotion);
      },
    );

    return () => {
      cancelled = true;
      cleanupVariant?.();
      pixiRenderer?.destroy(true);
    };
  }, []);

  return <div ref={wrapRef} aria-hidden="true" style={{ width: DISPLAY, height: DISPLAY, flexShrink: 0 }} />;
}
