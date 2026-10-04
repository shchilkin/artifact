import { useEffect, useRef, useState } from 'react';
import type { Artwork } from '../../../../../packages/runtime/src/artwork';
import { measureGpuTime } from '../../../../../packages/runtime/src/gpuTiming';
import { effectRegistry } from '../../../../../packages/runtime/src/index';
import { createLiveArtwork } from '../../../../../packages/runtime/src/liveArtwork';
import {
  DEFAULT_CASE_SEED,
  type EffectCase,
  FIXTURES,
  type FixtureName,
  PARITY_SIZE,
} from '../../../../../packages/runtime/src/testing/effectCase';
import { EFFECT_CASES } from '../../../../../packages/runtime/test/cases/index';
import graphicUrl from '../../../../../packages/runtime/test/fixtures/graphic.png?url';
import photoUrl from '../../../../../packages/runtime/test/fixtures/photo.webp?url';
import textUrl from '../../../../../packages/runtime/test/fixtures/text.png?url';
import type { EffectLayer } from '../../types/config';
import { formatEffectSliderValue } from '../node-canvas/inspector/EffectControlSections';
import { InspectorColorInput, InspectorSlider } from '../node-canvas/inspector/fields';
import { SegmentedControl, SegmentedControlTrigger } from '../ui/SegmentedControl';
import { LiveExportPanel } from './liveExport/LiveExportPanel';
import { PlateParallaxEntry } from './PlateParallaxEntry';
import {
  CATALOGUE_CONTEXT_ATTRIBUTES,
  catalogueBindings,
  catalogueControls,
  catalogueLayer,
  catalogueTitle,
  formatGpuBudget,
  formatGpuTime,
  gpuBudgetStatus,
} from './runtimeCatalogueModel';

const FIXTURE_URLS: Record<FixtureName, string> = { photo: photoUrl, graphic: graphicUrl, text: textUrl };
/** Displayed size; the drawing buffer is twice that, so every effect renders and is timed at 540px. */
const CSS_SIZE = PARITY_SIZE / 2;

const images = new Map<string, Promise<HTMLImageElement>>();
function loadImage(url: string): Promise<HTMLImageElement> {
  let image = images.get(url);
  if (!image) {
    const element = new Image();
    element.src = url;
    image = element.decode().then(() => element);
    images.set(url, image);
  }
  return image;
}

export function RuntimeCatalogue() {
  const [fixture, setFixture] = useState<FixtureName>('photo');
  const [animate, setAnimate] = useState(false);
  const effects = effectRegistry.ids();

  return (
    <div className="runtime-catalogue">
      <header className="runtime-catalogue-header">
        <div>
          <p className="runtime-catalogue-eyebrow">Runtime</p>
          <h1 className="runtime-catalogue-title">Effect catalogue</h1>
        </div>
        <div className="runtime-catalogue-toolbar">
          <SegmentedControl aria-label="Source image">
            {FIXTURES.map((name) => (
              <SegmentedControlTrigger key={name} aria-pressed={fixture === name} onClick={() => setFixture(name)}>
                {name}
              </SegmentedControlTrigger>
            ))}
          </SegmentedControl>
          <SegmentedControl aria-label="Playback">
            <SegmentedControlTrigger aria-pressed={!animate} onClick={() => setAnimate(false)}>
              Still
            </SegmentedControlTrigger>
            <SegmentedControlTrigger aria-pressed={animate} onClick={() => setAnimate(true)}>
              Animate
            </SegmentedControlTrigger>
          </SegmentedControl>
        </div>
      </header>
      <ul className="runtime-catalogue-grid">
        {effects.map((effect) => (
          <li key={effect}>
            <EffectEntry effect={effect} effectCase={EFFECT_CASES[effect]} fixture={fixture} animate={animate} />
          </li>
        ))}
        <li>
          <PlateParallaxEntry animate={animate} />
        </li>
      </ul>
      <LiveExportPanel />
    </div>
  );
}

function EffectEntry({
  effect,
  effectCase,
  fixture,
  animate,
}: {
  effect: string;
  effectCase: EffectCase | undefined;
  fixture: FixtureName;
  animate: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const artworkRef = useRef<Artwork | null>(null);
  const animateRef = useRef(animate);
  const [layer, setLayer] = useState<EffectLayer | null>(() => catalogueLayer(effect, effectCase));
  const [gpuMs, setGpuMs] = useState<number | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const controls = catalogueControls(effect);
  const bindings = catalogueBindings(effectCase);
  const seed = effectCase?.seed ?? DEFAULT_CASE_SEED;
  const budget = gpuBudgetStatus(gpuMs);

  // Rebuild the artwork when the source or an authored value changes; playback follows `animate` below.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !layer) return;
    let cancelled = false;
    let artwork: Artwork | null = null;
    let measureTimer: ReturnType<typeof setTimeout> | undefined;
    setGpuMs(undefined);
    void loadImage(FIXTURE_URLS[fixture]).then((image) => {
      if (cancelled) return;
      try {
        const authored: Readonly<Record<string, unknown>> = { ...layer };
        // Pointer input on the canvas feeds the case's input bindings, in still and animated playback.
        artwork = createLiveArtwork({
          canvas,
          source: image,
          passes: [{ effect, layer: authored }],
          context: { seed, width: PARITY_SIZE, height: PARITY_SIZE },
          bindings: effectCase?.bindings,
          reducedMotion: false,
          observeVisibility: null,
          maxRenderSize: PARITY_SIZE,
          devicePixelRatio: PARITY_SIZE / CSS_SIZE,
          contextAttributes: CATALOGUE_CONTEXT_ATTRIBUTES,
        });
        artworkRef.current = artwork;
        if (animateRef.current) artwork.start();
        setError(null);
        const created = artwork;
        // Measure once the new artwork has settled, on the same context it draws to.
        measureTimer = setTimeout(() => {
          const gl = canvas.getContext('webgl2');
          if (!gl) return;
          void measureGpuTime(gl, () => created.seek(created.state.time), { samples: 10 }).then((timing) => {
            if (!cancelled) setGpuMs(timing?.medianMs ?? null);
          });
        }, 250);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    });
    return () => {
      cancelled = true;
      clearTimeout(measureTimer);
      artwork?.destroy();
      if (artworkRef.current === artwork) artworkRef.current = null;
    };
  }, [effect, effectCase, fixture, layer, seed]);

  useEffect(() => {
    animateRef.current = animate;
    const artwork = artworkRef.current;
    if (!artwork) return;
    if (animate) artwork.start();
    else artwork.pause();
  }, [animate]);

  const update = (field: string, value: number | string) =>
    setLayer((current) => (current ? ({ ...current, [field]: value } as EffectLayer) : current));

  return (
    <article className="runtime-catalogue-entry" data-effect={effect}>
      <canvas
        ref={canvasRef}
        className="runtime-catalogue-canvas"
        style={{ width: CSS_SIZE, height: CSS_SIZE }}
        aria-label={`${catalogueTitle(effect)} on the ${fixture} image`}
      />
      <div className="runtime-catalogue-details">
        <h2 className="runtime-catalogue-name">{catalogueTitle(effect)}</h2>
        <dl className="runtime-catalogue-meta">
          <div>
            <dt>GPU 540px</dt>
            <dd data-testid="runtime-gpu-time">{formatGpuTime(gpuMs)}</dd>
          </div>
          <div>
            <dt>Budget</dt>
            <dd className="runtime-catalogue-budget" data-budget={budget} data-testid="runtime-gpu-budget">
              {formatGpuBudget(budget)}
            </dd>
          </div>
          <div>
            <dt>Bindings</dt>
            <dd>{bindings.length > 0 ? bindings.join(', ') : 'none'}</dd>
          </div>
          <div>
            <dt>Parity</dt>
            <dd>{effectRegistry.get(effect)?.stochastic ? 'statistics' : 'pixels'}</dd>
          </div>
        </dl>
        {error && (
          <p className="runtime-catalogue-error" role="alert">
            {error}
          </p>
        )}
        {layer && (
          <div className="runtime-catalogue-controls">
            {controls.map((control) =>
              control.type === 'slider' ? (
                <InspectorSlider
                  key={control.field}
                  label={control.label}
                  value={Number(layer[control.field] ?? 0)}
                  min={control.min}
                  max={control.max}
                  overrideMax={control.overrideMax}
                  formatValue={(value) => formatEffectSliderValue(value, control.valueFormat)}
                  onChange={(value) => update(control.field, value)}
                />
              ) : (
                <InspectorColorInput
                  key={control.field}
                  label={control.label}
                  value={String(layer[control.field] ?? '#000000')}
                  onChange={(value) => update(control.field, value)}
                />
              ),
            )}
            <InspectorSlider
              label="Seed offset"
              value={layer.seedOffset ?? 0}
              min={0}
              max={100}
              onChange={(value) => update('seedOffset', value)}
            />
          </div>
        )}
      </div>
    </article>
  );
}
