// Browser side of the live-package spec (issue #333). Imported into the page from the dev server (`/@fs/`); the
// editor modules come from the app's own module graph (`/app/...`) so fonts, assets and renderer state are shared.
import type { BindingsDocument } from '../../../packages/runtime/src/bindings';
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
