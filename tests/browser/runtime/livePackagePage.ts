// Browser side of the live-package spec (issue #333). Imported into the page from the dev server (`/@fs/`); the
// editor modules come from the app's own module graph (`/app/...`) so fonts, assets and renderer state are shared.
import type { LivePackageManifest } from '../../../packages/runtime/src/livePackage';
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
}

export interface ExportRequest {
  readonly size: number;
  readonly approximate?: boolean;
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
  });
  // Through the zip and back, as a host would receive it.
  const files = await filesFromZip(await zipLivePackage(exported.files));
  const livePackage = await livePackageFromFiles(files);
  const parity = await measurePackageParity(doc, imageCache, livePackage);
  return {
    manifest: livePackage.manifest,
    files: [...files.keys()],
    comparison: parity.comparison,
    reviewPng: toPng(sideBySide([parity.editor, parity.runtime, diffImage(parity.editor, parity.runtime)])),
  };
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
