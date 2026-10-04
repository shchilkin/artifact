import type { BindingsDocument } from '../../../../../../packages/runtime/src/bindings';
import { effectRegistry } from '../../../../../../packages/runtime/src/effects/index';
import {
  LIVE_PACKAGE_FORMAT,
  LIVE_PACKAGE_MANIFEST,
  LIVE_PACKAGE_VERSION,
  type LivePackageManifest,
  parseLivePackage,
  type StackItem,
} from '../../../../../../packages/runtime/src/livePackage';
import { defaultPlateDepth, PLATE_EDGES, type PlateEdge } from '../../../../../../packages/runtime/src/plates';
import type { EffectRegistry } from '../../../../../../packages/runtime/src/registry';
import { ASPECT_SIZES, type CanvasDocument, type Layer } from '../../../types/config';
import { renderDocument } from '../../../utils/renderer';
import { type LivePlan, type LivePlanOptions, planLivePackage } from './livePlan';
import { createZip } from './zip';

export interface LiveExportOptions extends LivePlanOptions {
  /** Plate size in pixels. Default: the editor's export size for the document's aspect. */
  readonly width?: number;
  readonly height?: number;
  /** Longest side the runtime renders at. Default: the plates' longest side. */
  readonly maxRenderSize?: number;
  /** Bindings JSON targeting the package's passes, validated with the package. */
  readonly bindings?: BindingsDocument;
  readonly registry?: EffectRegistry;
}

export interface LiveExport {
  readonly manifest: LivePackageManifest;
  /** Every file of the package by path, `manifest.json` included. */
  readonly files: ReadonlyMap<string, Blob>;
  readonly plan: LivePlan;
}

const STILL = 'still.png';
const BACKGROUND = 'background.png';

/**
 * Exports a document as a live package: the editor renders the still, the plates and the background; effect layers
 * the runtime registry runs become chains with their authored values. The manifest is validated before it is
 * returned, so an export the runtime would reject fails here.
 */
export async function exportLivePackage(
  doc: CanvasDocument,
  imageCache: Map<string, HTMLImageElement>,
  options: LiveExportOptions = {},
): Promise<LiveExport> {
  const registry = options.registry ?? effectRegistry;
  const [defaultWidth, defaultHeight] = ASPECT_SIZES[doc.global.aspect ?? '1:1'];
  const width = options.width ?? defaultWidth;
  const height = options.height ?? defaultHeight;
  const plan = planLivePackage(doc, registry, options);
  const files = new Map<string, Blob>();

  files.set(STILL, await toPng(await renderDocument(doc, width, height, imageCache)));

  const stack: StackItem[] = [];
  if (plan.fallback) {
    // One still plate: the editor's own render, background included.
    stack.push({
      type: 'plate',
      file: STILL,
      layers: plan.stack[0].layers.map(layerRef),
      depth: 1,
      edges: PLATE_EDGES,
    });
  } else {
    // Parallax depth by stack order, top plates nearer; edges are the sides the plate's pixels reach.
    const plateCount = plan.stack.filter((item) => item.type === 'plate').length;
    let plateIndex = 0;
    for (const item of plan.stack) {
      if (item.type === 'chain') {
        stack.push({ type: 'chain', passes: item.passes });
        continue;
      }
      const file = `plates/${stack.length}.png`;
      const canvas = await renderPlate(doc, item.layers, width, height, imageCache);
      files.set(file, await toPng(canvas));
      stack.push({
        type: 'plate',
        file,
        layers: item.layers.map(layerRef),
        depth: defaultPlateDepth(plateIndex, plateCount),
        edges: plateEdges(canvas),
      });
      plateIndex += 1;
    }
    if (plan.background)
      files.set(BACKGROUND, await toPng(await renderPlate(doc, [], width, height, imageCache, true)));
  }

  const manifest = parseLivePackage(
    {
      format: LIVE_PACKAGE_FORMAT,
      version: LIVE_PACKAGE_VERSION,
      size: { width, height },
      maxRenderSize: options.maxRenderSize ?? Math.max(width, height),
      seed: doc.global.seed,
      still: STILL,
      ...(plan.background && !plan.fallback ? { background: BACKGROUND } : {}),
      stack,
      ...(options.bindings ? { bindings: options.bindings } : {}),
      baked: plan.baked,
      ...(plan.fallback ? { fallback: plan.fallback } : {}),
    },
    { registry },
  );
  files.set(LIVE_PACKAGE_MANIFEST, new Blob([`${JSON.stringify(manifest, null, 2)}\n`], { type: 'application/json' }));
  return { manifest, files, plan };
}

/** The package as one zip, manifest first. */
export async function zipLivePackage(files: ReadonlyMap<string, Blob>): Promise<Blob> {
  const ordered = [...files.keys()].sort((a, b) =>
    a === LIVE_PACKAGE_MANIFEST ? -1 : b === LIVE_PACKAGE_MANIFEST ? 1 : a.localeCompare(b),
  );
  const entries = await Promise.all(
    ordered.map(async (path) => ({ path, data: new Uint8Array(await files.get(path)!.arrayBuffer()) })),
  );
  return new Blob([createZip(entries) as BlobPart], { type: 'application/zip' });
}

/**
 * Renders some layers as the editor does, on a transparent canvas: stack mode with the document's own settings, so
 * a linear graph document draws its layers exactly as its graph does. `background` draws only the stack background.
 */
function renderPlate(
  doc: CanvasDocument,
  layers: readonly Layer[],
  width: number,
  height: number,
  imageCache: Map<string, HTMLImageElement>,
  background = false,
): Promise<HTMLCanvasElement> {
  const plateDoc: CanvasDocument = {
    ...doc,
    global: { ...doc.global, bg: background ? doc.global.bg : 'transparent' },
    layers: [...layers],
  };
  return renderDocument(plateDoc, width, height, imageCache, { graphMode: 'stack' });
}

/**
 * The sides of the frame where the plate has a pixel that is not fully transparent. When the plate moves, the runtime
 * keeps those sides beyond the frame; a plate with a transparent border (`[]`) moves freely.
 */
export function plateEdges(plate: HTMLCanvasElement): PlateEdge[] {
  const { width, height } = plate;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return [...PLATE_EDGES];
  ctx.drawImage(plate, 0, 0);
  const strips: Record<PlateEdge, ImageData> = {
    top: ctx.getImageData(0, 0, width, 1),
    right: ctx.getImageData(width - 1, 0, 1, height),
    bottom: ctx.getImageData(0, height - 1, width, 1),
    left: ctx.getImageData(0, 0, 1, height),
  };
  return PLATE_EDGES.filter((edge) => {
    const { data } = strips[edge];
    for (let index = 3; index < data.length; index += 4) if (data[index] > 0) return true;
    return false;
  });
}

function layerRef(layer: Layer) {
  return { id: layer.id, name: layer.name };
}

function toPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('The plate could not be encoded.'))), 'image/png');
  });
}
