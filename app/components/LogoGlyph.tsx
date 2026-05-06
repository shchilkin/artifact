import { useLayoutEffect, useRef } from "react";
import { Container, Renderer } from "pixi.js";
import { ALL_EMOJIS } from "../types/config";
import { RENDER, VARIANTS } from "../utils/logoVariants";

const DISPLAY = 32;

export function LogoGlyph() {
    const wrapRef = useRef<HTMLDivElement>(null);

    useLayoutEffect(() => {
        const wrap = wrapRef.current;
        if (!wrap) return;

        const emoji = ALL_EMOJIS[Math.floor(Math.random() * ALL_EMOJIS.length)];
        const variant = VARIANTS[Math.floor(Math.random() * VARIANTS.length)];

        let renderer: Renderer;
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

        const canvas = renderer.view as HTMLCanvasElement;
        canvas.style.cssText =
            `display:block;width:${DISPLAY}px;height:${DISPLAY}px;image-rendering:pixelated;`;
        wrap.appendChild(canvas);

        const stage = new Container();
        const reducedMotion = window.matchMedia(
            "(prefers-reduced-motion: reduce)",
        ).matches;
        const cleanupVariant = variant(stage, renderer, emoji, reducedMotion);

        return () => {
            cleanupVariant();
            renderer.destroy(true);
        };
    }, []);

    return (
        <div
            ref={wrapRef}
            aria-hidden="true"
            style={{ width: DISPLAY, height: DISPLAY, flexShrink: 0 }}
        />
    );
}
