// Browser side of the live-package spec (issue #333). Imported into the page from the dev server (`/@fs/`); the
// editor modules come from the app's own module graph (`/app/...`) so fonts, assets and renderer state are shared.
import type { BindingsDocument } from '../../../packages/runtime/src/bindings';
import type { LayerControl } from '../../../packages/runtime/src/layers';
import { createLiveArtwork } from '../../../packages/runtime/src/liveArtwork';
import type { LivePackage, LivePackageManifest } from '../../../packages/runtime/src/livePackage';
import { diffImage, type ParityComparison, sideBySide } from '../../../packages/runtime/src/testing/parity';

type ExportModule = typeof import('../../../apps/web/app/components/runtime-catalogue/liveExport/exportLivePackage');
type FilesModule = typeof import('../../../apps/web/app/components/runtime-catalogue/liveExport/packageFromFiles');
type ParityModule = typeof import('../../../apps/web/app/components/runtime-catalogue/liveExport/packageParity');
type ProjectModule = typeof import('../../../apps/web/app/components/runtime-catalogue/liveExport/projectDocument');
type SampleModule = typeof import('../../../apps/web/app/components/runtime-catalogue/liveExport/sampleCover');
type CanvasDocument = import('../../../apps/web/app/types/config').CanvasDocument;

const LIVE_EXPORT = '/app/components/runtime-catalogue/liveExport';
const fixtureUrl = new URL('../../../packages/runtime/test/fixtures/graphic.png', import.meta.url).href;

export interface LivePackageResult {
  readonly manifest: LivePackageManifest;
  readonly files: string[];
  readonly comparison: ParityComparison;
  /** Editor | runtime | diff, as a PNG data URL. */
  readonly reviewPng: string;
  /** The requested frames, as PNG data URLs. */
  readonly frames: readonly { readonly name: string; readonly png: string }[];
}

export interface ExportRequest {
  readonly size: number;
  readonly approximate?: boolean;
  /** Source layers to export on plates of their own (`LiveExportOptions.separate`). */
  readonly separate?: readonly string[];
  /** Bindings JSON to export with; the resting frame is then drawn through them (t = 0, inputs at rest). */
  readonly bindings?: BindingsDocument;
  /** Frames to record through the bindings: inputs set with `setInput`, then a seek to `seconds`. */
  readonly frames?: readonly {
    readonly name: string;
    readonly seconds: number;
    readonly input?: Record<string, number>;
  }[];
}

/** Exports the sample cover, zips it, reads the zip back, and compares the resting frame with the editor. */
export async function sampleCover(request: ExportRequest): Promise<LivePackageResult> {
  const { sampleLiveCover } = (await import(/* @vite-ignore */ `${LIVE_EXPORT}/sampleCover.ts`)) as SampleModule;
  const image = new Image();
  image.src = fixtureUrl;
  await image.decode();
  return exportAndCompare(sampleLiveCover(fixtureUrl), new Map([[fixtureUrl, image]]), request);
}

/** The same for an `.artifact` project's text (the Вайбер cover in a manual run). */
export async function projectCover(text: string, request: ExportRequest): Promise<LivePackageResult> {
  const { loadProjectDocument } = (await import(
    /* @vite-ignore */ `${LIVE_EXPORT}/projectDocument.ts`
  )) as ProjectModule;
  const { doc, imageCache } = await loadProjectDocument(text);
  return exportAndCompare(doc, imageCache, request);
}

async function exportAndCompare(
  doc: CanvasDocument,
  imageCache: Map<string, HTMLImageElement>,
  request: ExportRequest,
): Promise<LivePackageResult> {
  const { exportLivePackage, zipLivePackage } = (await import(
    /* @vite-ignore */ `${LIVE_EXPORT}/exportLivePackage.ts`
  )) as ExportModule;
  const { filesFromZip, livePackageFromFiles } = (await import(
    /* @vite-ignore */ `${LIVE_EXPORT}/packageFromFiles.ts`
  )) as FilesModule;
  const { measurePackageParity } = (await import(/* @vite-ignore */ `${LIVE_EXPORT}/packageParity.ts`)) as ParityModule;
  const exported = await exportLivePackage(doc, imageCache, {
    width: request.size,
    height: request.size,
    approximate: request.approximate,
    separate: request.separate,
    bindings: request.bindings,
  });
  // Through the zip and back, as a host would receive it.
  const files = await filesFromZip(await zipLivePackage(exported.files));
  const livePackage = await livePackageFromFiles(files);
  const parity = await measurePackageParity(doc, imageCache, livePackage, { live: Boolean(request.bindings) });
  const frames: { name: string; png: string }[] = [];
  for (const frame of request.frames ?? [])
    frames.push({ name: frame.name, png: await recordFrame(livePackage, frame) });
  return {
    manifest: livePackage.manifest,
    files: [...files.keys()],
    comparison: parity.comparison,
    reviewPng: toPng(sideBySide([parity.editor, parity.runtime, diffImage(parity.editor, parity.runtime)])),
    frames,
  };
}

async function recordFrame(
  livePackage: LivePackage,
  frame: { readonly seconds: number; readonly input?: Record<string, number> },
): Promise<string> {
  const { width, height } = livePackage.manifest.size;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const artwork = createLiveArtwork({
    canvas,
    livePackage,
    observeVisibility: null,
    devicePixelRatio: 1,
    pointer: false,
    reducedMotion: false,
    contextAttributes: { preserveDrawingBuffer: true },
  });
  await artwork.ready;
  for (const [name, value] of Object.entries(frame.input ?? {})) artwork.setInput(name, value);
  artwork.seek(frame.seconds);
  const png = canvas.toDataURL('image/png');
  artwork.destroy();
  return png;
}

function toPng(image: { width: number; height: number; data: Uint8ClampedArray | Uint8Array }): string {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  canvas
    .getContext('2d')
    ?.putImageData(new ImageData(new Uint8ClampedArray(image.data), image.width, image.height), 0, 0);
  return canvas.toDataURL('image/png');
}

/** A frame of the layer-options run: inputs and layer options, then a seek. */
export interface LayerFrame {
  readonly name: string;
  readonly seconds: number;
  readonly input?: Record<string, number>;
  readonly layers?: LayerControl;
}

export interface LayerFramesResult {
  readonly manifest: LivePackageManifest;
  readonly comparison: ParityComparison;
  /** Opaque pixels of the Title's plate, where nothing beneath shows through. */
  readonly titlePixels: number;
  readonly frames: readonly {
    readonly name: string;
    readonly png: string;
    /** Pixels that differ from the first frame where the Title is opaque, and everywhere else. */
    readonly changedOnTitle: number;
    readonly changedElsewhere: number;
  }[];
  /** `setLayerOptions` on a stopped artwork (redrawn at once) and a running one (after its next frame). */
  readonly switched: { readonly stopped: number; readonly running: number };
}

/**
 * Layer options on the sample cover (issue #429): exports it with `sampleLayerBindings` and the Title on its own plate,
 * renders each frame, and counts the pixels that differ from the first frame on the Title and elsewhere.
 */
export async function layerFrames(frames: readonly LayerFrame[]): Promise<LayerFramesResult> {
  const { sampleLayerBindings, sampleLiveCover } = (await import(
    /* @vite-ignore */ `${LIVE_EXPORT}/sampleCover.ts`
  )) as SampleModule;
  const { exportLivePackage } = (await import(
    /* @vite-ignore */ `${LIVE_EXPORT}/exportLivePackage.ts`
  )) as ExportModule;
  const { livePackageFromFiles } = (await import(
    /* @vite-ignore */ `${LIVE_EXPORT}/packageFromFiles.ts`
  )) as FilesModule;
  const { measurePackageParity, readPixels } = (await import(
    /* @vite-ignore */ `${LIVE_EXPORT}/packageParity.ts`
  )) as ParityModule;
  const image = new Image();
  image.src = fixtureUrl;
  await image.decode();
  const doc = sampleLiveCover(fixtureUrl);
  const imageCache = new Map([[fixtureUrl, image]]);
  const exported = await exportLivePackage(doc, imageCache, {
    width: 540,
    height: 540,
    separate: ['Title'],
    bindings: sampleLayerBindings(),
  });
  const livePackage = await livePackageFromFiles(exported.files);
  const parity = await measurePackageParity(doc, imageCache, livePackage, { live: true });
  const { width, height } = livePackage.manifest.size;

  const titlePlate = livePackage.manifest.stack.find(
    (item) => item.type === 'plate' && item.layers.some((layer) => layer.name === 'Title'),
  );
  if (!titlePlate || titlePlate.type !== 'plate') throw new Error('no Title plate');
  const titleAlpha = readPixels(livePackage.images[titlePlate.file] as CanvasImageSource, width, height).data;
  const onTitle = (pixel: number) => titleAlpha[pixel * 4 + 3] === 255;
  let titlePixels = 0;
  for (let pixel = 0; pixel < width * height; pixel += 1) if (onTitle(pixel)) titlePixels += 1;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const play = (layers?: LayerControl) =>
    createLiveArtwork({
      canvas,
      livePackage,
      observeVisibility: null,
      devicePixelRatio: 1,
      pointer: false,
      reducedMotion: false,
      contextAttributes: { preserveDrawingBuffer: true },
      ...layers,
    });
  const capture = () => readPixels(canvas, width, height).data;
  const changed = (a: Uint8ClampedArray, b: Uint8ClampedArray) => {
    const counts = { onTitle: 0, elsewhere: 0 };
    for (let pixel = 0; pixel < width * height; pixel += 1) {
      const offset = pixel * 4;
      const same =
        a[offset] === b[offset] &&
        a[offset + 1] === b[offset + 1] &&
        a[offset + 2] === b[offset + 2] &&
        a[offset + 3] === b[offset + 3];
      if (!same) counts[onTitle(pixel) ? 'onTitle' : 'elsewhere'] += 1;
    }
    return counts;
  };

  const results: LayerFramesResult['frames'][number][] = [];
  let first: Uint8ClampedArray | null = null;
  for (const frame of frames) {
    const artwork = play(frame.layers);
    await artwork.ready;
    for (const [name, value] of Object.entries(frame.input ?? {})) artwork.setInput(name, value);
    artwork.seek(frame.seconds);
    const pixels = capture();
    first ??= pixels;
    const counts = changed(first, pixels);
    results.push({
      name: frame.name,
      png: canvas.toDataURL('image/png'),
      changedOnTitle: counts.onTitle,
      changedElsewhere: counts.elsewhere,
    });
    artwork.destroy();
  }

  // setLayerOptions: the pointer in a corner, then every layer switched off; compared with the first frame.
  const artwork = play();
  await artwork.ready;
  artwork.setInput('pointer.x', 1);
  artwork.setInput('pointer.y', 1);
  artwork.seek(0);
  artwork.setLayerOptions({ layerDefaults: { interactive: false } });
  const stoppedCounts = changed(first!, capture());
  artwork.setLayerOptions({});
  artwork.start();
  artwork.setLayerOptions({ layerDefaults: { interactive: false, animated: false } });
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  const runningCounts = changed(first!, capture());
  artwork.destroy();

  return {
    manifest: livePackage.manifest,
    comparison: parity.comparison,
    titlePixels,
    frames: results,
    switched: {
      stopped: stoppedCounts.onTitle + stoppedCounts.elsewhere,
      running: runningCounts.onTitle + runningCounts.elsewhere,
    },
  };
}
