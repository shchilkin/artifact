import type { GeneratorConfig } from "../types/config";
import { render } from "./renderer";
import { buildFilters } from "./pixiFilters";
import { gpuRenderToCanvas } from "./gpuRender";

export interface EffectMeta {
    title: string;
    description: string;
    valueLabel: string;
    /** Overrides applied on top of BASE_CFG to demonstrate this effect in isolation */
    cfgOverride: Partial<GeneratorConfig>;
}

const BASE_SEED = 12345;

const BASE_CFG: GeneratorConfig = {
    bg: "#120020",
    emojis: ["💔", "👽", "✦", "🔥"],
    density: 30,
    minSz: 24,
    maxSz: 72,
    blur: 40,
    grain: 0,
    scanlines: 0,
    rayInt: 50,
    rayColor: "#bb00ff",
    rays: 10,
    ca: 0,
    glitch: 0,
    tint: "#350055",
    tintOp: 20,
    morphAmt: 0,
    morphFreq: 5,
    tearAmt: 0,
    tearSize: 3,
    noiseWarp: 0,
    vortex: 0,
    barrel: 0,
    mirror: 0,
    dataMosh: 0,
    interlace: 0,
    pixelate: 0,
    hueShift: 0,
    rgbSplit: 0,
    vignette: 0,
    bloom: 0,
    posterize: 0,
    filmBurn: 0,
    duotone: 0,
    duoA: "#0a0020",
    duoB: "#ff6ec7",
    halftone: 0,
    risoShift: 0,
    risoAngle: 15,
    parentalAdvisory: false,
    advisoryX: 0.05,
    advisoryY: 0.82,
    advisoryBorder: true,
};

export const EFFECT_META: Record<string, EffectMeta> = {
    density: {
        title: "Density",
        description: "How many emojis are scattered across the canvas.",
        valueLabel: "45 emojis",
        cfgOverride: { density: 45 },
    },
    blur: {
        title: "Depth Blur",
        description: "Progressive blur, sharpest at center, softest at edges.",
        valueLabel: "blur 70",
        cfgOverride: { blur: 70 },
    },
    rayInt: {
        title: "Ray Intensity",
        description: "Brightness of the radiating light beams from center.",
        valueLabel: "intensity 80",
        cfgOverride: { rayInt: 80, rays: 12 },
    },
    rays: {
        title: "Ray Count",
        description: "Number of light rays emanating from the center point.",
        valueLabel: "20 rays",
        cfgOverride: { rays: 20, rayInt: 70 },
    },
    bloom: {
        title: "Bloom",
        description: "Glow bleed from bright areas, like overexposed film.",
        valueLabel: "bloom 80",
        cfgOverride: { bloom: 80, rayInt: 70 },
    },
    filmBurn: {
        title: "Film Burn",
        description: "Hot corner flare, like film left exposed to light.",
        valueLabel: "burn 80",
        cfgOverride: { filmBurn: 80 },
    },
    glitch: {
        title: "VHS Streaks",
        description:
            "Horizontal color bars layered over the image in screen blend.",
        valueLabel: "14 streaks",
        cfgOverride: { glitch: 14 },
    },
    ca: {
        title: "Chromatic Aberration",
        description:
            "Red and blue channel shift, like a misaligned camera lens.",
        valueLabel: "shift 10",
        cfgOverride: { ca: 10 },
    },
    interlace: {
        title: "Interlace",
        description:
            "Alternating scanline row shift, like a CRT signal dropout.",
        valueLabel: "intensity 60",
        cfgOverride: { interlace: 60 },
    },
    dataMosh: {
        title: "Data Mosh",
        description: "Block displacement glitch, like a corrupted video frame.",
        valueLabel: "intensity 70",
        cfgOverride: { dataMosh: 70 },
    },
    grain: {
        title: "Film Grain",
        description:
            "Noise layered at overlay blend mode, adds organic texture.",
        valueLabel: "grain 50",
        cfgOverride: { grain: 50 },
    },
    scanlines: {
        title: "Scanlines",
        description:
            "Horizontal dark lines across the image, like a CRT monitor.",
        valueLabel: "30 lines",
        cfgOverride: { scanlines: 30 },
    },
    tintOp: {
        title: "Tint Opacity",
        description:
            "Strength of the color tint multiply layer over the image.",
        valueLabel: "opacity 60",
        cfgOverride: { tintOp: 60 },
    },
    noiseWarp: {
        title: "Noise Warp",
        description:
            "Smooth hash-based organic distortion across the full image.",
        valueLabel: "intensity 70",
        cfgOverride: { noiseWarp: 70 },
    },
    morphAmt: {
        title: "Liquid Morph",
        description:
            "Wave-driven distortion: the image shimmers like heat haze.",
        valueLabel: "intensity 60",
        cfgOverride: { morphAmt: 60, morphFreq: 6 },
    },
    morphFreq: {
        title: "Morph Frequency",
        description:
            "Wave frequency of the liquid morph. Higher means tighter ripples.",
        valueLabel: "freq 14",
        cfgOverride: { morphAmt: 50, morphFreq: 14 },
    },
    vortex: {
        title: "Vortex",
        description:
            "Rotational twist from center outward: the image spirals inward.",
        valueLabel: "intensity 70",
        cfgOverride: { vortex: 70 },
    },
    barrel: {
        title: "Barrel Distortion",
        description:
            "Lens distortion that bulges the image outward from center.",
        valueLabel: "k 60",
        cfgOverride: { barrel: 60 },
    },
    tearAmt: {
        title: "Chunk Tear",
        description: "Horizontal strip displacement, like a VHS tape dropout.",
        valueLabel: "intensity 10",
        cfgOverride: { tearAmt: 10, tearSize: 4 },
    },
    tearSize: {
        title: "Tear Strip Height",
        description: "Height of the displaced strips in the chunk tear effect.",
        valueLabel: "size 8",
        cfgOverride: { tearAmt: 8, tearSize: 8 },
    },
    mirror: {
        title: "Mirror",
        description: "Fold symmetry: 1 horizontal, 2 vertical, 3 quad.",
        valueLabel: "fold-x",
        cfgOverride: { mirror: 1 },
    },
    hueShift: {
        title: "Hue Shift",
        description: "Rotates all colors around the hue wheel.",
        valueLabel: "120°",
        cfgOverride: { hueShift: 120 },
    },
    rgbSplit: {
        title: "RGB Split",
        description: "Diagonal RGB channel separation: a prism effect.",
        valueLabel: "split 18",
        cfgOverride: { rgbSplit: 18 },
    },
    vignette: {
        title: "Vignette",
        description: "Darkens image edges toward the brand tone.",
        valueLabel: "intensity 80",
        cfgOverride: { vignette: 80 },
    },
    pixelate: {
        title: "Pixelate",
        description: "Mosaic pixelation. Larger values produce bigger blocks.",
        valueLabel: "block 8",
        cfgOverride: { pixelate: 8 },
    },
    posterize: {
        title: "Posterize",
        description: "Reduces the color palette to hard stepped bands.",
        valueLabel: "6 steps",
        cfgOverride: { posterize: 6 },
    },
    duotone: {
        title: "Duotone",
        description:
            "Maps dark and light tones to two ink colors, like risograph.",
        valueLabel: "strength 80",
        cfgOverride: { duotone: 80 },
    },
    halftone: {
        title: "Halftone",
        description:
            "Replaces the image with a dot-screen grid, like offset print.",
        valueLabel: "grid 15",
        cfgOverride: { halftone: 15 },
    },
    risoShift: {
        title: "Misregistration",
        description:
            "Print misregistration offset: a double-exposed riso print look.",
        valueLabel: "shift 22",
        cfgOverride: { risoShift: 22, risoAngle: 30 },
    },
    risoAngle: {
        title: "Misreg Angle",
        description: "Direction of the misregistration shift in degrees.",
        valueLabel: "angle 45°",
        cfgOverride: { risoShift: 18, risoAngle: 45 },
    },
};

const THUMB_SIZE = 200;
const thumbCache = new Map<string, string>();

export async function renderEffectThumb(key: string): Promise<string> {
    if (thumbCache.has(key)) return thumbCache.get(key)!;

    const meta = EFFECT_META[key];
    if (!meta) return "";

    const cfg: GeneratorConfig = { ...BASE_CFG, ...meta.cfgOverride };

    const offscreen = document.createElement("canvas");
    offscreen.width = THUMB_SIZE;
    offscreen.height = THUMB_SIZE;

    await new Promise<void>((resolve) =>
        setTimeout(() => {
            render(
                offscreen.getContext("2d", { willReadFrequently: true })!,
                THUMB_SIZE,
                THUMB_SIZE,
                cfg,
                BASE_SEED,
            );
            resolve();
        }, 0)
    );

    const filters = buildFilters(cfg, BASE_SEED, THUMB_SIZE, THUMB_SIZE);
    let url: string;

    if (!filters) {
        url = offscreen.toDataURL("image/jpeg", 0.8);
    } else {
        try {
            const out = await gpuRenderToCanvas({
                width: THUMB_SIZE,
                height: THUMB_SIZE,
                source: offscreen,
                filters,
            });
            url = out.toDataURL("image/jpeg", 0.8);
        } catch {
            url = offscreen.toDataURL("image/jpeg", 0.8);
        }
    }

    thumbCache.set(key, url);
    return url;
}
