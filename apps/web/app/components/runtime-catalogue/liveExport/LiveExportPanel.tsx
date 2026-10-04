import { Button } from '@artifact/ui';
import { type ChangeEvent, useEffect, useRef, useState } from 'react';
import type { Artwork } from '../../../../../../packages/runtime/src/artwork';
import { createLiveArtwork } from '../../../../../../packages/runtime/src/liveArtwork';
import type { LivePackage } from '../../../../../../packages/runtime/src/livePackage';
import { plateCaseBindings } from '../../../../../../packages/runtime/src/testing/plateCase';
import graphicUrl from '../../../../../../packages/runtime/test/fixtures/graphic.png?url';
import type { CanvasDocument } from '../../../types/config';
import { SegmentedControl, SegmentedControlTrigger } from '../../ui/SegmentedControl';
import { exportLivePackage, type LiveExport, zipLivePackage } from './exportLivePackage';
import { livePackageFromFiles } from './packageFromFiles';
import { measurePackageParity, type PackageParity } from './packageParity';
import { loadProjectDocument } from './projectDocument';
import { sampleLiveCover } from './sampleCover';

function formatDepth(depth: number | undefined): string {
  return depth === undefined ? 'default' : `${Math.round(depth * 100)}%`;
}

/** Displayed size of the still and the live canvas. */
const CSS_SIZE = 270;
const SIZES = [540, 1080] as const;

interface Source {
  readonly name: string;
  readonly doc: CanvasDocument;
  readonly imageCache: Map<string, HTMLImageElement>;
}

interface Result {
  readonly exported: LiveExport;
  readonly livePackage: LivePackage;
  readonly stillUrl: string;
  readonly parity: PackageParity;
}

async function sampleSource(): Promise<Source> {
  const image = new Image();
  image.src = graphicUrl;
  await image.decode();
  return { name: 'Sample cover', doc: sampleLiveCover(graphicUrl), imageCache: new Map([[graphicUrl, image]]) };
}

/** Development-only: export a document as a live package, play it, and download it as a zip. */
export function LiveExportPanel() {
  const [source, setSource] = useState<Source | null>(null);
  const [size, setSize] = useState<(typeof SIZES)[number]>(540);
  const [approximate, setApproximate] = useState(false);
  const [bindings, setBindings] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    void sampleSource().then(setSource, (cause: unknown) => setError(String(cause)));
  }, []);

  useEffect(
    () => () => {
      if (result) URL.revokeObjectURL(result.stillUrl);
    },
    [result],
  );

  // Play the exported package with its bindings and pointer input.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !result) return;
    let artwork: Artwork | null = null;
    try {
      artwork = createLiveArtwork({
        canvas,
        livePackage: result.livePackage,
        observeVisibility: null,
        reducedMotion: false,
        devicePixelRatio: result.livePackage.manifest.size.width / CSS_SIZE,
      });
      artwork.start();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      queueMicrotask(() => setError(message));
    }
    return () => artwork?.destroy();
  }, [result]);

  const openFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const project = await loadProjectDocument(await file.text());
      setSource({ name: file.name, ...project });
      setResult(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const runExport = async () => {
    if (!source) return;
    setBusy(true);
    setError(null);
    try {
      const exported = await exportLivePackage(source.doc, source.imageCache, {
        width: size,
        height: size,
        approximate,
        bindings: bindings.trim() ? JSON.parse(bindings) : undefined,
      });
      const livePackage = await livePackageFromFiles(exported.files);
      const parity = await measurePackageParity(source.doc, source.imageCache, livePackage);
      const still = exported.files.get(exported.manifest.still);
      setResult({ exported, livePackage, parity, stillUrl: still ? URL.createObjectURL(still) : '' });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const download = async () => {
    if (!result || !source) return;
    const zip = await zipLivePackage(result.exported.files);
    const url = URL.createObjectURL(zip);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${source.name.replace(/\.[^.]+$/, '')}-live-${size}.zip`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const manifest = result?.exported.manifest;
  const comparison = result?.parity.comparison;
  return (
    <section className="runtime-catalogue-export" aria-labelledby="live-export-title">
      <div className="runtime-catalogue-details">
        <h2 id="live-export-title" className="runtime-catalogue-name">
          Live package export
        </h2>
        <p className="runtime-catalogue-note">
          Splits a document into plates the editor renders and chains the runtime runs. Source: {source?.name ?? '…'}
        </p>
        <div className="runtime-catalogue-toolbar">
          <label className="runtime-catalogue-file">
            <span>Open .artifact</span>
            <input type="file" accept=".artifact,.json,application/json" onChange={openFile} disabled={busy} />
          </label>
          <SegmentedControl aria-label="Plate size">
            {SIZES.map((value) => (
              <SegmentedControlTrigger key={value} aria-pressed={size === value} onClick={() => setSize(value)}>
                {value}px
              </SegmentedControlTrigger>
            ))}
          </SegmentedControl>
          <label className="runtime-catalogue-check">
            <input type="checkbox" checked={approximate} onChange={(event) => setApproximate(event.target.checked)} />
            Move unsupported effects beneath the chain (approximate)
          </label>
          <Button variant="primary" onClick={runExport} loading={busy} disabled={!source}>
            Export
          </Button>
          <Button onClick={download} disabled={!result}>
            Download .zip
          </Button>
        </div>
        <Button onClick={() => setBindings(JSON.stringify(plateCaseBindings(), null, 1))}>Parallax example</Button>
        <label className="runtime-catalogue-bindings">
          <span>Bindings JSON (optional; passes are counted bottom up across chains)</span>
          <textarea
            value={bindings}
            onChange={(event) => setBindings(event.target.value)}
            rows={3}
            spellCheck={false}
            placeholder='{ "version": 1, "loop": { "durationSeconds": 6 }, "bindings": [ … ] }'
          />
        </label>
        {error && (
          <p className="runtime-catalogue-error" role="alert">
            {error}
          </p>
        )}
      </div>
      {result && manifest && comparison && (
        <div className="runtime-catalogue-export-result">
          <figure>
            <img src={result.stillUrl} width={CSS_SIZE} height={CSS_SIZE} alt="Editor still" />
            <figcaption>Editor still</figcaption>
          </figure>
          <figure>
            <canvas
              ref={canvasRef}
              className="runtime-catalogue-canvas"
              style={{ width: CSS_SIZE, height: CSS_SIZE }}
              aria-label="Live package playing"
            />
            <figcaption>Runtime, playing</figcaption>
          </figure>
          <dl className="runtime-catalogue-meta" data-testid="live-export-summary">
            <div>
              <dt>Stack</dt>
              <dd>
                <ol className="runtime-catalogue-stack">
                  {manifest.stack.map((item, index) => (
                    <li key={item.type === 'plate' ? item.file : `chain-${index}`}>
                      {item.type === 'plate'
                        ? `plate (depth ${formatDepth(item.depth)}${item.edges ? (item.edges.length > 0 ? `, edges ${item.edges.join(' ')}` : '') : ', edges: all'}): ${item.layers.map((layer) => layer.name).join(', ') || 'empty'}`
                        : `chain: ${item.passes.map((pass) => `${pass.effect} (${pass.source.name})`).join(', ')}`}
                    </li>
                  ))}
                  {manifest.background && <li>background</li>}
                </ol>
              </dd>
            </div>
            <div>
              <dt>Baked</dt>
              <dd>
                {manifest.baked.length === 0
                  ? 'none'
                  : manifest.baked.map((layer) => `${layer.name}: ${layer.reason}`).join('; ')}
              </dd>
            </div>
            {manifest.fallback && (
              <div>
                <dt>Fallback</dt>
                <dd>{manifest.fallback}</dd>
              </div>
            )}
            <div>
              <dt>At rest vs editor</dt>
              <dd data-testid="live-export-parity">
                {comparison.pass ? 'pass' : 'fail'} ·{' '}
                {comparison.mode === 'pixels'
                  ? `${(comparison.differentRatio * 100).toFixed(3)}% over ${comparison.tolerance.channelThreshold} levels, mean ${comparison.meanAbsDiff.toFixed(3)}`
                  : `mean ${comparison.meanDiff.toFixed(2)}, std dev ${comparison.stdDevDiff.toFixed(2)}, histogram ${comparison.histogramDistance.toFixed(4)}`}
              </dd>
            </div>
          </dl>
        </div>
      )}
    </section>
  );
}
