import { useEffect, useRef, useState } from 'react';
import type { Artwork } from '../../../../../packages/runtime/src/artwork';
import { createLiveArtwork } from '../../../../../packages/runtime/src/liveArtwork';
import {
  cardPlate,
  PLATE_CASE_BREATHING,
  PLATE_CASE_SIZE,
  PLATE_CASE_STRENGTH,
  plateCaseBindings,
  plateCasePackage,
} from '../../../../../packages/runtime/src/testing/plateCase';
import graphicUrl from '../../../../../packages/runtime/test/fixtures/graphic.png?url';
import photoUrl from '../../../../../packages/runtime/test/fixtures/photo.webp?url';
import { InspectorSlider } from '../node-canvas/inspector/fields';

const CSS_SIZE = PLATE_CASE_SIZE / 2;

interface Settings {
  /** Offset at depth 1, percent of the frame. */
  readonly strength: number;
  /** Percent. */
  readonly bottomDepth: number;
  readonly topDepth: number;
  /** Scale growth at depth 1, percent. */
  readonly breathing: number;
  /** Degrees at depth 1. */
  readonly tilt: number;
}

const DEFAULTS: Settings = {
  strength: PLATE_CASE_STRENGTH * 100,
  bottomDepth: 50,
  topDepth: 100,
  breathing: PLATE_CASE_BREATHING * 100,
  tilt: 0,
};

async function decode(url: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = url;
  await image.decode();
  return image;
}

/**
 * Plate transforms (issue #394): the harness's two-plate package (photo under a Noise Warp chain, a card above) with
 * pointer parallax and a breathing wave. Depth sets how far each plate moves; strength how far the nearest moves.
 */
export function PlateParallaxEntry({ animate }: { animate: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const artworkRef = useRef<Artwork | null>(null);
  const animateRef = useRef(animate);
  const [settings, setSettings] = useState(DEFAULTS);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    let artwork: Artwork | null = null;
    void Promise.all([decode(photoUrl), decode(graphicUrl)]).then(([photo, graphic]) => {
      if (cancelled) return;
      try {
        const livePackage = plateCasePackage(photo, cardPlate(graphic), {
          depths: [settings.bottomDepth / 100, settings.topDepth / 100],
          bindings: plateCaseBindings({
            strength: settings.strength / 100,
            breathing: settings.breathing / 100,
            tilt: settings.tilt,
          }),
        });
        artwork = createLiveArtwork({
          canvas,
          livePackage,
          reducedMotion: false,
          observeVisibility: null,
          devicePixelRatio: PLATE_CASE_SIZE / CSS_SIZE,
        });
        artworkRef.current = artwork;
        if (animateRef.current) artwork.start();
        setError(null);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    });
    return () => {
      cancelled = true;
      artwork?.destroy();
      if (artworkRef.current === artwork) artworkRef.current = null;
    };
  }, [settings]);

  useEffect(() => {
    animateRef.current = animate;
    if (animate) artworkRef.current?.start();
    else artworkRef.current?.pause();
  }, [animate]);

  const update = (key: keyof Settings) => (value: number) => setSettings((current) => ({ ...current, [key]: value }));

  return (
    <article className="runtime-catalogue-entry" data-effect="plateParallax">
      <canvas
        ref={canvasRef}
        className="runtime-catalogue-canvas"
        style={{ width: CSS_SIZE, height: CSS_SIZE }}
        aria-label="Plate parallax on the photo and graphic images"
      />
      <div className="runtime-catalogue-details">
        <h2 className="runtime-catalogue-name">Plate parallax</h2>
        <dl className="runtime-catalogue-meta">
          <div>
            <dt>Plates</dt>
            <dd>
              photo (depth {settings.bottomDepth}%) → Noise Warp → card (depth {settings.topDepth}%)
            </dd>
          </div>
          <div>
            <dt>Bindings</dt>
            <dd>pointer.x, pointer.y, wave track</dd>
          </div>
        </dl>
        {error && (
          <p className="runtime-catalogue-error" role="alert">
            {error}
          </p>
        )}
        <div className="runtime-catalogue-controls">
          <InspectorSlider
            label="Strength"
            value={settings.strength}
            min={0}
            max={10}
            step={0.5}
            formatValue={(value) => `${value}%`}
            onChange={update('strength')}
          />
          <InspectorSlider
            label="Bottom depth"
            value={settings.bottomDepth}
            min={0}
            max={100}
            formatValue={(value) => `${value}%`}
            onChange={update('bottomDepth')}
          />
          <InspectorSlider
            label="Top depth"
            value={settings.topDepth}
            min={0}
            max={100}
            formatValue={(value) => `${value}%`}
            onChange={update('topDepth')}
          />
          <InspectorSlider
            label="Breathing"
            value={settings.breathing}
            min={0}
            max={5}
            step={0.5}
            formatValue={(value) => `${value}%`}
            onChange={update('breathing')}
          />
          <InspectorSlider
            label="Tilt"
            value={settings.tilt}
            min={0}
            max={8}
            formatValue={(value) => `${value}°`}
            onChange={update('tilt')}
          />
        </div>
      </div>
    </article>
  );
}
