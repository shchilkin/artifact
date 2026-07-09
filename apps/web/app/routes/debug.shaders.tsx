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
    palette: ['#e8decf', '#bda98f', '#f7efe1', '#7e6b58'],
    grain: 34,
    scale: 72,
  },
  water: {
    palette: ['#08223a', '#1c7ed6', '#77e7ff', '#e8fff8'],
    distortion: 72,
    swirl: 54,
    grain: 4,
  },
  waterCaustic: {
    palette: ['#031a2f', '#0877a8', '#79f7ff', '#f3fff2'],
    distortion: 74,
    scale: 88,
    grain: 1,
  },
  heatmap: {
    palette: ['#141a33', '#0077ff', '#f7d23b', '#ff3b30'],
    distortion: 66,
    scale: 88,
  },
  liquidMetal: {
    palette: ['#1d2027', '#93a3b8', '#e8edf5', '#5d748c'],
    distortion: 82,
    grain: 4,
  },
  gemSmoke: {
    palette: ['#180b2d', '#6c4dff', '#2ef0c5', '#fff1c9'],
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
    palette: ['#05030a', '#f7e6ff', '#ff6ab7', '#50e3c2'],
    distortion: 45,
    swirl: 42,
    scale: 96,
    grain: 1,
  },
  concentricPatterns: {
    palette: ['#050207', '#45f2a8', '#ff6a5f', '#ffe184'],
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
    palette: ['#09030f', '#6534ff', '#ff6ad5', '#fff4b8'],
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
    palette: ['#090407', '#45f2a8', '#ff6a5f', '#ffe184'],
    grain: 1,
  },
  metaballs: {
    distortion: 78,
    swirl: 80,
    grain: 3,
  },
  colorPanels: {
    palette: ['#17120d', '#f25f5c', '#70c1b3', '#ffe066'],
    grain: 2,
  },
  smokeRing: {
    palette: ['#070509', '#5033a6', '#d5bcff', '#fff3d6'],
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
    palette: ['#151a20', '#6f8793', '#e7e3d4', '#b68a62'],
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
      version: 2,
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
    palette: ['#172018', '#506640', '#c8c59a', '#f2e6be'],
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
