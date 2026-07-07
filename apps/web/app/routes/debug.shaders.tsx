import { useEffect, useRef } from 'react';
import type { MetaFunction } from 'react-router';
import {
  DOCUMENT_SCHEMA_VERSION,
  EFFECT_PRESET_MENU_ORDER,
  EFFECT_PRESETS,
  type EffectPreset,
  makeEffectPresetLayer,
  makeFillLayer,
  makeGraphShaderNode,
  makeTextLayer,
  SHADER_KINDS,
  type ShaderKind,
} from '../types/config';
import { renderShaderNodeToCanvas } from '../utils/render/shaderNodes';
import { renderDocument } from '../utils/renderer';
import './debug.shaders.css';

export const meta: MetaFunction = () => [
  { title: 'Shader Debug Grid | Artifact' },
  {
    name: 'description',
    content: 'Internal shader renderer inspection grid.',
  },
];

const PREVIEW_WIDTH = 360;
const PREVIEW_HEIGHT = 224;

const SHADER_LABELS: Record<ShaderKind, string> = {
  paperTexture: 'Paper Texture',
  water: 'Water',
  waterCaustic: 'Water Caustic',
  heatmap: 'Heatmap',
  liquidMetal: 'Liquid Metal',
  gemSmoke: 'Gem Smoke',
  meshGradient: 'Mesh Gradient',
  staticRadialGradient: 'Static Radial Gradient',
  grainGradient: 'Grain Gradient',
  dotOrbit: 'Dot Orbit',
  dotGrid: 'Dot Grid',
  moire: 'Moire',
  concentricPatterns: 'Concentric Patterns',
  spiral: 'Spiral',
  swirl: 'Swirl',
  waves: 'Waves',
  glowingWave: 'Glowing Wave',
  neuroNoise: 'Neuro Noise',
  perlin: 'Perlin',
  simplexNoise: 'Simplex Noise',
  voronoi: 'Voronoi',
  borderRings: 'Border Rings',
  metaballs: 'Metaballs',
  colorPanels: 'Color Panels',
  smokeRing: 'Smoke Ring',
  noiseField: 'Noise Field',
  marble: 'Marble',
  liquid: 'Liquid',
  customSpec: 'AI Shader',
  customCode: 'Code Shader',
  tilelessTexture: 'Tileless Texture',
};

const SHADER_PROFILES: Partial<Record<ShaderKind, Partial<ReturnType<typeof makeGraphShaderNode>>>> = {
  paperTexture: {
    colorA: '#e8decf',
    colorB: '#bda98f',
    colorC: '#f7efe1',
    colorD: '#7e6b58',
    grain: 34,
    scale: 72,
  },
  water: {
    colorA: '#08223a',
    colorB: '#1c7ed6',
    colorC: '#77e7ff',
    colorD: '#e8fff8',
    distortion: 72,
    swirl: 54,
    grain: 4,
  },
  waterCaustic: {
    colorA: '#031a2f',
    colorB: '#0877a8',
    colorC: '#79f7ff',
    colorD: '#f3fff2',
    distortion: 74,
    scale: 88,
    grain: 1,
  },
  heatmap: {
    colorA: '#141a33',
    colorB: '#0077ff',
    colorC: '#f7d23b',
    colorD: '#ff3b30',
    distortion: 66,
    scale: 88,
  },
  liquidMetal: {
    colorA: '#1d2027',
    colorB: '#93a3b8',
    colorC: '#e8edf5',
    colorD: '#5d748c',
    distortion: 82,
    grain: 4,
  },
  gemSmoke: {
    colorA: '#180b2d',
    colorB: '#6c4dff',
    colorC: '#2ef0c5',
    colorD: '#fff1c9',
    distortion: 70,
    swirl: 70,
    grain: 8,
  },
  dotOrbit: {
    scale: 112,
    rotation: 12,
    grain: 3,
  },
  dotGrid: {
    scale: 126,
    grain: 0,
  },
  moire: {
    colorA: '#05030a',
    colorB: '#f7e6ff',
    colorC: '#ff6ab7',
    colorD: '#50e3c2',
    distortion: 45,
    swirl: 42,
    scale: 96,
    grain: 1,
  },
  concentricPatterns: {
    colorA: '#050207',
    colorB: '#45f2a8',
    colorC: '#ff6a5f',
    colorD: '#ffe184',
    distortion: 28,
    swirl: 48,
    scale: 92,
    grain: 1,
  },
  spiral: {
    distortion: 36,
    swirl: 88,
    grain: 4,
  },
  swirl: {
    distortion: 74,
    swirl: 88,
    grain: 4,
  },
  waves: {
    distortion: 64,
    swirl: 42,
    scale: 74,
    grain: 3,
  },
  glowingWave: {
    colorA: '#09030f',
    colorB: '#6534ff',
    colorC: '#ff6ad5',
    colorD: '#fff4b8',
    distortion: 56,
    swirl: 65,
    scale: 76,
    grain: 2,
  },
  neuroNoise: {
    distortion: 78,
    swirl: 78,
    scale: 86,
    grain: 6,
  },
  perlin: {
    distortion: 40,
    scale: 72,
    grain: 2,
  },
  simplexNoise: {
    distortion: 52,
    scale: 78,
    grain: 2,
  },
  voronoi: {
    scale: 120,
    grain: 0,
  },
  borderRings: {
    colorA: '#090407',
    colorB: '#45f2a8',
    colorC: '#ff6a5f',
    colorD: '#ffe184',
    grain: 1,
  },
  metaballs: {
    distortion: 78,
    swirl: 80,
    grain: 3,
  },
  colorPanels: {
    colorA: '#17120d',
    colorB: '#f25f5c',
    colorC: '#70c1b3',
    colorD: '#ffe066',
    grain: 2,
  },
  smokeRing: {
    colorA: '#070509',
    colorB: '#5033a6',
    colorC: '#d5bcff',
    colorD: '#fff3d6',
    distortion: 78,
    grain: 8,
  },
  noiseField: {
    distortion: 82,
    swirl: 72,
    scale: 82,
    grain: 6,
  },
  marble: {
    colorA: '#151a20',
    colorB: '#6f8793',
    colorC: '#e7e3d4',
    colorD: '#b68a62',
    distortion: 82,
    swirl: 58,
    grain: 4,
  },
  liquid: {
    distortion: 82,
    swirl: 62,
    grain: 4,
  },
  customSpec: {
    grain: 0,
    customShaderSpec: {
      version: 1,
      label: 'AI Shader',
      prompt: 'neon halftone wave texture',
      palette: ['#080816', '#7b61ff', '#ff4ec7', '#55f7d5'],
      base: 0.46,
      contrast: 1.24,
      operations: [
        { op: 'noise', scale: 4.8, amount: 0.26, octaves: 4 },
        { op: 'wave', frequency: 16, amplitude: 0.22, angle: 0.8 },
        { op: 'threshold', value: 0.52, softness: 0.12 },
      ],
    },
  },
  customCode: {
    name: 'Code Shader',
    distortion: 74,
    opacity: 74,
  },
  tilelessTexture: {
    colorA: '#172018',
    colorB: '#506640',
    colorC: '#c8c59a',
    colorD: '#f2e6be',
    distortion: 58,
    grain: 10,
  },
};

function ShaderPreviewCard({ kind, index }: { kind: ShaderKind; index: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const target = canvasRef.current;
    const targetCtx = target?.getContext('2d');
    if (!target || !targetCtx) return;

    const node = makeGraphShaderNode({
      id: `debug-${kind}`,
      name: SHADER_LABELS[kind],
      shaderKind: kind,
      seedOffset: index * 23,
      ...SHADER_PROFILES[kind],
    });
    const rendered = renderShaderNodeToCanvas(node, 1171, PREVIEW_WIDTH, PREVIEW_HEIGHT);
    targetCtx.clearRect(0, 0, target.width, target.height);
    targetCtx.drawImage(rendered, 0, 0, target.width, target.height);
  }, [index, kind]);

  return (
    <article className="shader-debug-card" data-shader-kind={kind}>
      <canvas
        ref={canvasRef}
        className="shader-debug-canvas"
        width={PREVIEW_WIDTH}
        height={PREVIEW_HEIGHT}
        aria-label={`${SHADER_LABELS[kind]} shader preview`}
      />
      <div className="shader-debug-card__meta">
        <h2>{SHADER_LABELS[kind]}</h2>
        <p>{kind}</p>
      </div>
    </article>
  );
}

function EffectPreviewCard({ preset, index }: { preset: EffectPreset; index: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const target = canvasRef.current;
    const targetCtx = target?.getContext('2d');
    if (!target || !targetCtx) return;
    const textColor =
      getComputedStyle(document.documentElement).getPropertyValue('--text').trim() || 'rgb(247 230 212)';

    const doc = {
      schemaVersion: DOCUMENT_SCHEMA_VERSION,
      global: { bg: '#120706', seed: 2107 + index * 31, aspect: '16:9' as const },
      layers: [
        makeFillLayer({ id: `debug-effect-base-${preset}`, name: 'Debug Base', color: '#16100c' }),
        makeTextLayer({
          id: `debug-effect-text-${preset}`,
          name: 'Debug Source',
          content: 'SHADER',
          color: textColor,
          size: 74,
          x: 0.5,
          y: 0.48,
          scaleX: 1.1,
        }),
        makeEffectPresetLayer(preset, { id: `debug-effect-${preset}`, seedOffset: index * 19 }),
      ],
      export: { format: 'png' as const, scale: 1 as const, target: 'cover' as const },
    };

    renderDocument(doc, PREVIEW_WIDTH, PREVIEW_HEIGHT, new Map(), { graphMode: 'stack' }).then((rendered) => {
      if (cancelled) return;
      targetCtx.clearRect(0, 0, target.width, target.height);
      targetCtx.drawImage(rendered, 0, 0, target.width, target.height);
    });

    return () => {
      cancelled = true;
    };
  }, [index, preset]);

  const label = EFFECT_PRESETS[preset].name;
  return (
    <article className="shader-debug-card" data-effect-preset={preset}>
      <canvas
        ref={canvasRef}
        className="shader-debug-canvas"
        width={PREVIEW_WIDTH}
        height={PREVIEW_HEIGHT}
        aria-label={`${label} effect preview`}
      />
      <div className="shader-debug-card__meta">
        <h2>{label}</h2>
        <p>{preset}</p>
      </div>
    </article>
  );
}

export default function DebugShadersRoute() {
  return (
    <main className="shader-debug-page">
      <header className="shader-debug-header">
        <div>
          <p className="shader-debug-kicker">internal renderer check</p>
          <h1>Shader Debug Grid</h1>
        </div>
        <p>
          {SHADER_KINDS.length} fills / {EFFECT_PRESET_MENU_ORDER.length} effects
        </p>
      </header>
      <section className="shader-debug-section" aria-label="Shader fill preview grid">
        <div className="shader-debug-section__header">
          <h2>Shader Fills</h2>
          <p>{SHADER_KINDS.length} standalone source variants</p>
        </div>
        <div className="shader-debug-grid">
          {SHADER_KINDS.map((kind, index) => (
            <ShaderPreviewCard key={kind} kind={kind} index={index} />
          ))}
        </div>
      </section>
      <section className="shader-debug-section" aria-label="Shader effect preview grid">
        <div className="shader-debug-section__header">
          <h2>Shader Effects</h2>
          <p>{EFFECT_PRESET_MENU_ORDER.length} input-dependent effect variants</p>
        </div>
        <div className="shader-debug-grid">
          {EFFECT_PRESET_MENU_ORDER.map((preset, index) => (
            <EffectPreviewCard key={preset} preset={preset} index={index} />
          ))}
        </div>
      </section>
    </main>
  );
}
