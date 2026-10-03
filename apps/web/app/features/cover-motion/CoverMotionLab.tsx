import { type ChangeEvent, useCallback, useEffect, useRef, useState } from 'react';
import type { CanvasDocument, ImageLayer, PortableFontAsset } from '../../types/config';
import { importArtifactProjectPackage, parseArtifactProjectPackage } from '../../utils/documentPackage';
import { preloadImageSources } from '../../utils/preloadImageSources';
import { renderDocument } from '../../utils/renderer';
import {
  applyCoverMotionFrame,
  type CoverMotionRecipe,
  coverMotionFrameCount,
  coverMotionFrameTime,
  parseCoverMotionRecipe,
} from './coverMotion';

interface LoadedCover {
  doc: CanvasDocument;
  imageCache: Map<string, HTMLImageElement>;
}

interface FontFileInput {
  name: string;
  dataUrl: string;
}

interface CoverMotionHarness {
  load(
    packageText: string,
    fonts?: FontFileInput[],
  ): Promise<{ layers: { id: string; name?: string; kind: string }[] }>;
  setRecipe(recipe: unknown): number;
  renderFrame(index: number, size: number): Promise<string>;
}

declare global {
  interface Window {
    __coverMotion?: CoverMotionHarness;
  }
}

const EMPTY_RECIPE: CoverMotionRecipe = { version: 1, durationSeconds: 6, fps: 24, tracks: [] };
const PREVIEW_SIZE = 540;

function readText(file: File) {
  return file.text();
}

function readDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function dataUrlBytes(dataUrl: string) {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  return Math.floor((base64.length * 3) / 4);
}

/**
 * Packages exported with `metadata-only` fonts keep the font id and family but no file.
 * Supplying the original font file restores it under the same id, so text renders as authored.
 */
async function loadCoverPackage(packageText: string, fonts: FontFileInput[] = []): Promise<LoadedCover> {
  const projectPackage = parseArtifactProjectPackage(packageText);
  if (!projectPackage) throw new Error('Not an Artifact project package');
  const missingFonts = projectPackage.manifest.fonts.filter((font) => font.embedding === 'metadata-only' && font.asset);
  const fontAssets: PortableFontAsset[] = [...(projectPackage.document.fontAssets ?? [])];
  missingFonts.forEach((font, index) => {
    const file = fonts[index] ?? fonts[0];
    if (!file || !font.asset) return;
    fontAssets.push({
      id: font.asset.id,
      family: font.asset.family,
      label: font.asset.label,
      mime: font.asset.mime ?? 'font/ttf',
      createdAt: font.asset.createdAt ?? new Date().toISOString(),
      dataUrl: file.dataUrl,
      bytes: dataUrlBytes(file.dataUrl),
      source: 'local-file',
      sourceName: file.name,
    });
  });
  const doc = await importArtifactProjectPackage({
    ...projectPackage,
    document: { ...projectPackage.document, fontAssets },
  });
  const imageCache = new Map<string, HTMLImageElement>();
  const imageSources = doc.layers
    .filter((layer): layer is ImageLayer => layer.kind === 'image' && Boolean(layer.src))
    .map((layer) => layer.src);
  await preloadImageSources(Array.from(new Set(imageSources)), imageCache);
  return { doc, imageCache };
}

function renderCoverFrame(cover: LoadedCover, recipe: CoverMotionRecipe, index: number, size: number) {
  const frameDoc = applyCoverMotionFrame(cover.doc, recipe, coverMotionFrameTime(recipe, index));
  return renderDocument(frameDoc, size, size, cover.imageCache, { effectResolution: { width: size, height: size } });
}

export default function CoverMotionLab() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const coverRef = useRef<LoadedCover | null>(null);
  const recipeRef = useRef<CoverMotionRecipe>(EMPTY_RECIPE);
  const fontsRef = useRef<FontFileInput[]>([]);
  const [status, setStatus] = useState('Load an .artifact package to start.');
  const [recipeText, setRecipeText] = useState(JSON.stringify(EMPTY_RECIPE, null, 2));
  const [layers, setLayers] = useState<{ id: string; name?: string; kind: string }[]>([]);
  const [playing, setPlaying] = useState(true);
  const [frame, setFrame] = useState(0);
  const [frames, setFrames] = useState(() => coverMotionFrameCount(EMPTY_RECIPE));

  const loadPackage = useCallback(async (packageText: string, fonts: FontFileInput[] = fontsRef.current) => {
    setStatus('Loading package…');
    const cover = await loadCoverPackage(packageText, fonts);
    coverRef.current = cover;
    const nextLayers = cover.doc.layers.map((layer) => ({
      id: layer.id,
      name: (layer as { name?: string }).name,
      kind: layer.kind,
    }));
    setLayers(nextLayers);
    setStatus(`Loaded ${nextLayers.length} layers.`);
    return { layers: nextLayers };
  }, []);

  const applyRecipe = useCallback((value: unknown) => {
    const recipe = parseCoverMotionRecipe(value);
    recipeRef.current = recipe;
    setRecipeText(JSON.stringify(recipe, null, 2));
    const count = coverMotionFrameCount(recipe);
    setFrames(count);
    return count;
  }, []);

  useEffect(() => {
    window.__coverMotion = {
      load: loadPackage,
      setRecipe: applyRecipe,
      async renderFrame(index, size) {
        const cover = coverRef.current;
        if (!cover) throw new Error('No package loaded');
        const canvas = await renderCoverFrame(cover, recipeRef.current, index, size);
        return canvas.toDataURL('image/png');
      },
    };
    return () => {
      delete window.__coverMotion;
    };
  }, [applyRecipe, loadPackage]);

  // Live loop: render the frame for the current loop time; skip ticks while a render is in flight.
  useEffect(() => {
    let raf = 0;
    let busy = false;
    let cancelled = false;
    const startedAt = performance.now();
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const cover = coverRef.current;
      const canvas = canvasRef.current;
      if (!playing || busy || !cover || !canvas) return;
      const recipe = recipeRef.current;
      const elapsed = (performance.now() - startedAt) / 1000;
      const index = Math.floor(elapsed * recipe.fps) % coverMotionFrameCount(recipe);
      busy = true;
      renderCoverFrame(cover, recipe, index, PREVIEW_SIZE)
        .then((rendered) => {
          if (cancelled) return;
          const ctx = canvas.getContext('2d');
          ctx?.clearRect(0, 0, canvas.width, canvas.height);
          ctx?.drawImage(rendered, 0, 0, canvas.width, canvas.height);
          setFrame(index);
        })
        .catch((error: unknown) => setStatus(error instanceof Error ? error.message : String(error)))
        .finally(() => {
          busy = false;
        });
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [playing]);

  const onPackage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      await loadPackage(await readText(file));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  };

  const onFonts = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    fontsRef.current = await Promise.all(
      files.map(async (file) => ({ name: file.name, dataUrl: await readDataUrl(file) })),
    );
    setStatus(`${files.length} font file(s) ready; load the package again to apply them.`);
  };

  const onRecipe = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      applyRecipe(JSON.parse(await readText(file)));
      setStatus('Recipe loaded.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  };

  const onApplyText = () => {
    try {
      applyRecipe(JSON.parse(recipeText));
      setStatus('Recipe applied.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <main style={{ display: 'grid', gap: 16, gridTemplateColumns: 'minmax(0, 540px) minmax(0, 1fr)', padding: 24 }}>
      <section style={{ display: 'grid', gap: 8, alignContent: 'start' }}>
        <canvas
          ref={canvasRef}
          width={PREVIEW_SIZE}
          height={PREVIEW_SIZE}
          style={{ width: '100%', aspectRatio: '1', background: '#111' }}
        />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button type="button" onClick={() => setPlaying((value) => !value)}>
            {playing ? 'Pause' : 'Play'}
          </button>
          <span>
            Frame {frame + 1} / {frames}
          </span>
        </div>
        <p role="status">{status}</p>
      </section>
      <section style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
        <h1 style={{ margin: 0 }}>Cover Motion</h1>
        <label>
          Fonts for metadata-only text (optional, load first){' '}
          <input type="file" accept=".ttf,.otf,.woff,.woff2" multiple onChange={onFonts} />
        </label>
        <label>
          Project package <input type="file" accept=".artifact,application/json" onChange={onPackage} />
        </label>
        <label>
          Recipe file <input type="file" accept=".json" onChange={onRecipe} />
        </label>
        <textarea
          value={recipeText}
          onChange={(event) => setRecipeText(event.target.value)}
          rows={18}
          spellCheck={false}
          style={{ fontFamily: 'monospace', fontSize: 12 }}
        />
        <button type="button" onClick={onApplyText}>
          Apply recipe
        </button>
        <details>
          <summary>Layers ({layers.length})</summary>
          <ul style={{ fontFamily: 'monospace', fontSize: 12 }}>
            {layers.map((layer) => (
              <li key={layer.id}>
                {layer.id} · {layer.kind} · {layer.name}
              </li>
            ))}
          </ul>
        </details>
      </section>
    </main>
  );
}
