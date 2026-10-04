import { BindingError, type BindingsDocument, compileLiveChain, type LivePass } from './bindings.js';
import type { CompositeStep } from './chain.js';
import { effectRegistry as defaultRegistry } from './effects/index.js';
import type { EffectContext, EffectRegistry } from './registry.js';
import type { ArtworkSource, ChainPass } from './types.js';

/**
 * A live package (issue #333): what Artifact exports for the runtime to play. `manifest.json` describes the
 * composite; the image files next to it hold everything the runtime does not animate, rendered by the editor.
 */
export const LIVE_PACKAGE_FORMAT = 'artifact-live-package';
export const LIVE_PACKAGE_VERSION = 1;
/** File name of the manifest inside a package folder or zip. */
export const LIVE_PACKAGE_MANIFEST = 'manifest.json';

/** A document layer a package item came from, for diagnostics. */
export interface LayerRef {
  readonly id: string;
  readonly name: string;
}

/**
 * Pixels the editor rendered at export time (text, images, emoji, 3D, effects the runtime does not run), with alpha.
 * The bottom plate is the image the first chain reads; every later plate is composited over the image beneath it.
 */
export interface PlateItem {
  readonly type: 'plate';
  /** Path of a PNG inside the package. */
  readonly file: string;
  /** The layers drawn into this plate, bottom first. */
  readonly layers: readonly LayerRef[];
}

/** One runtime effect of a chain: an authored effect layer's values for one registered effect. */
export interface PackagePass extends LivePass {
  /** The effect layer it comes from. One layer with several registered effects gives several passes. */
  readonly source: LayerRef;
}

/** Effect passes the runtime runs on the image beneath them, in order. */
export interface ChainItem {
  readonly type: 'chain';
  readonly passes: readonly PackagePass[];
}

export type StackItem = PlateItem | ChainItem;

/** An effect layer that the editor rendered into a plate instead of the runtime running it. */
export interface BakedLayer extends LayerRef {
  /** The layer's active effects, by editor field (for example `glitch`, `scanlines`). */
  readonly effects: readonly string[];
  readonly reason: string;
}

export interface LivePackageManifest {
  readonly format: typeof LIVE_PACKAGE_FORMAT;
  readonly version: typeof LIVE_PACKAGE_VERSION;
  /** Pixel size the plates were rendered at; also the size effect uniforms are computed for. */
  readonly size: { readonly width: number; readonly height: number };
  /** Longest drawing-buffer side the runtime should render at. */
  readonly maxRenderSize: number;
  /** `doc.global.seed`: effect seeds are this plus each layer's `seedOffset`. */
  readonly seed: number;
  /** Path of the editor's render of the whole document: the still for hosts without WebGL2. */
  readonly still: string;
  /** Path of a plate drawn beneath the final composite (a stack document's background), if any. */
  readonly background?: string;
  /** The composite, bottom first: a plate, then chains and plates. Its order is the depth order. */
  readonly stack: readonly StackItem[];
  /** Bindings JSON (`docs/runtime/README.md`); `pass` indexes every chain's passes counted bottom up. */
  readonly bindings?: BindingsDocument;
  /** Effect layers rendered into plates, with why. */
  readonly baked: readonly BakedLayer[];
  /** Why the package has no live chain at all, when the exporter fell back to a single still plate. */
  readonly fallback?: string;
}

/** A manifest with its images decoded, keyed by their path in the manifest. */
export interface LivePackage {
  readonly manifest: LivePackageManifest;
  readonly images: Readonly<Record<string, ArtworkSource>>;
}

export class LivePackageError extends Error {
  readonly issues: readonly string[];
  constructor(issues: readonly string[]) {
    super(`Invalid live package:\n${issues.map((issue) => `- ${issue}`).join('\n')}`);
    this.name = 'LivePackageError';
    this.issues = issues;
  }
}

const MANIFEST_KEYS = [
  'format',
  'version',
  'size',
  'maxRenderSize',
  'seed',
  'still',
  'background',
  'stack',
  'bindings',
  'baked',
  'fallback',
];

export interface ParseLivePackageOptions {
  readonly registry?: EffectRegistry;
}

/**
 * Checks a manifest (plain JSON) and returns it typed. Every pass must name a registered effect that is on at rest,
 * and the bindings must fit the package's passes. Throws `LivePackageError` listing every problem with its path.
 */
export function parseLivePackage(value: unknown, options: ParseLivePackageOptions = {}): LivePackageManifest {
  const registry = options.registry ?? defaultRegistry;
  const issues: string[] = [];
  const fail = (path: string, message: string) => issues.push(`${path}: ${message}`);

  if (!isRecord(value)) throw new LivePackageError(['manifest: must be an object']);
  if (value.format !== LIVE_PACKAGE_FORMAT) {
    fail('format', `must be "${LIVE_PACKAGE_FORMAT}", got ${describe(value.format)}`);
  }
  if (value.version !== LIVE_PACKAGE_VERSION) {
    const newer = typeof value.version === 'number' && value.version > LIVE_PACKAGE_VERSION;
    fail(
      'version',
      newer
        ? `${value.version} is newer than this runtime reads (${LIVE_PACKAGE_VERSION}); update @artifact/runtime`
        : `must be ${LIVE_PACKAGE_VERSION}, got ${describe(value.version)}`,
    );
  }
  for (const key of Object.keys(value)) {
    if (!MANIFEST_KEYS.includes(key)) fail(key, `unknown key; expected one of ${MANIFEST_KEYS.join(', ')}`);
  }

  let size: { width: number; height: number } | null = null;
  if (!isRecord(value.size)) fail('size', 'must be { "width": …, "height": … } in pixels');
  else {
    const { width, height } = value.size;
    if (!isPositiveInteger(width)) fail('size.width', `must be a whole number of pixels, got ${describe(width)}`);
    if (!isPositiveInteger(height)) fail('size.height', `must be a whole number of pixels, got ${describe(height)}`);
    if (isPositiveInteger(width) && isPositiveInteger(height)) size = { width, height };
  }
  if (!isPositiveInteger(value.maxRenderSize)) {
    fail('maxRenderSize', `must be a whole number of pixels, got ${describe(value.maxRenderSize)}`);
  }
  if (!(typeof value.seed === 'number' && Number.isFinite(value.seed))) {
    fail('seed', `must be a number, got ${describe(value.seed)}`);
  }
  checkPath(value.still, 'still', fail);
  if (value.background !== undefined) checkPath(value.background, 'background', fail);
  if (value.fallback !== undefined && typeof value.fallback !== 'string') fail('fallback', 'must be a string');

  const passes: LivePass[] = [];
  if (!Array.isArray(value.stack) || value.stack.length === 0) {
    fail('stack', 'must be a non-empty array of plates and chains, bottom first');
  } else {
    let previous: unknown = null;
    value.stack.forEach((item, index) => {
      const path = `stack[${index}]`;
      if (!isRecord(item)) return fail(path, 'must be { "type": "plate", … } or { "type": "chain", … }');
      if (item.type === 'plate') checkPlate(item, path, fail);
      else if (item.type === 'chain') {
        if (index === 0) fail(path, 'the bottom of the stack must be a plate: a chain needs an image to run on');
        if (previous === 'chain') fail(path, 'two chains in a row; merge them into one chain');
        checkChain(item, path, registry, size, value.seed, passes, fail);
      } else fail(`${path}.type`, `must be "plate" or "chain", got ${describe(item.type)}`);
      previous = item.type;
    });
  }

  if (!Array.isArray(value.baked)) fail('baked', 'must be an array (empty when nothing was baked)');
  else value.baked.forEach((layer, index) => checkBaked(layer, `baked[${index}]`, fail));

  // Bindings target the package's passes: check them against those passes, as the runtime will compile them.
  if (value.bindings !== undefined && issues.length === 0 && size) {
    try {
      compileLiveChain({
        passes,
        context: effectContext(value as unknown as LivePackageManifest),
        bindings: value.bindings,
        registry,
      });
    } catch (error) {
      if (!(error instanceof BindingError)) throw error;
      for (const issue of error.issues) issues.push(`bindings.${issue}`);
    }
  }

  if (issues.length > 0) throw new LivePackageError(issues);
  return value as unknown as LivePackageManifest;
}

function checkPlate(item: Record<string, unknown>, path: string, fail: (path: string, message: string) => void) {
  unknownKeys(item, ['type', 'file', 'layers'], `${path}.`, fail);
  checkPath(item.file, `${path}.file`, fail);
  if (!Array.isArray(item.layers)) return fail(`${path}.layers`, 'must be an array of { "id", "name" }');
  item.layers.forEach((layer, index) => checkLayerRef(layer, `${path}.layers[${index}]`, fail));
}

function checkChain(
  item: Record<string, unknown>,
  path: string,
  registry: EffectRegistry,
  size: { width: number; height: number } | null,
  seed: unknown,
  passes: LivePass[],
  fail: (path: string, message: string) => void,
) {
  unknownKeys(item, ['type', 'passes'], `${path}.`, fail);
  if (!Array.isArray(item.passes) || item.passes.length === 0) {
    return fail(`${path}.passes`, 'must be a non-empty array of passes');
  }
  item.passes.forEach((pass, index) => {
    const passPath = `${path}.passes[${index}]`;
    if (!isRecord(pass)) return fail(passPath, 'must be { "effect", "layer", "source" }');
    unknownKeys(pass, ['effect', 'layer', 'source'], `${passPath}.`, fail);
    checkLayerRef(pass.source, `${passPath}.source`, fail);
    const layerOk = isRecord(pass.layer) && Object.values(pass.layer).every(isAuthoredValue);
    if (!layerOk) fail(`${passPath}.layer`, 'must be an object of authored values (numbers, strings, booleans)');
    if (typeof pass.effect !== 'string' || !registry.has(pass.effect)) {
      fail(
        `${passPath}.effect`,
        `unknown effect ${describe(pass.effect)}; this runtime runs ${registry.ids().join(', ')}`,
      );
      return;
    }
    if (!layerOk) return;
    const live = { effect: pass.effect, layer: pass.layer as LivePass['layer'] };
    const context = { seed: typeof seed === 'number' ? seed : 0, width: size?.width ?? 1, height: size?.height ?? 1 };
    if (!registry.pass(live.effect, live.layer, context)) {
      fail(`${passPath}.layer`, `${pass.effect} is off for these values; the exporter only writes effects that are on`);
    }
    passes.push(live);
  });
}

function checkBaked(layer: unknown, path: string, fail: (path: string, message: string) => void) {
  if (!isRecord(layer)) return fail(path, 'must be { "id", "name", "effects", "reason" }');
  unknownKeys(layer, ['id', 'name', 'effects', 'reason'], `${path}.`, fail);
  checkLayerRef({ id: layer.id, name: layer.name }, path, fail);
  if (!(Array.isArray(layer.effects) && layer.effects.every((effect) => typeof effect === 'string'))) {
    fail(`${path}.effects`, 'must be an array of effect names');
  }
  if (typeof layer.reason !== 'string' || layer.reason.length === 0) fail(`${path}.reason`, 'must say why');
}

function checkLayerRef(value: unknown, path: string, fail: (path: string, message: string) => void) {
  if (!isRecord(value)) return fail(path, 'must be { "id": …, "name": … }');
  if (typeof value.id !== 'string' || value.id.length === 0) fail(`${path}.id`, 'must be a layer id');
  if (typeof value.name !== 'string') fail(`${path}.name`, 'must be a string');
}

/** A path inside the package: relative, forward slashes, no `..` and no URL scheme. */
function checkPath(value: unknown, path: string, fail: (path: string, message: string) => void) {
  if (typeof value !== 'string' || value.length === 0) return fail(path, 'must be a file path inside the package');
  const segments = value.split('/');
  if (value.startsWith('/') || /^[a-z][a-z0-9+.-]*:/i.test(value) || value.includes('\\') || segments.includes('..')) {
    fail(path, `must be a relative path inside the package like "plates/0.png", got ${describe(value)}`);
  }
}

/** Every pass of every chain, bottom up: the indices bindings target. */
export function livePackagePasses(manifest: LivePackageManifest): PackagePass[] {
  return manifest.stack.flatMap((item) => (item.type === 'chain' ? item.passes : []));
}

/** Image paths the manifest reads: the plates in stack order, the background, and the still. */
export function livePackageFiles(manifest: LivePackageManifest): string[] {
  const plates = manifest.stack.flatMap((item) => (item.type === 'plate' ? [item.file] : []));
  return [...new Set([...plates, ...(manifest.background ? [manifest.background] : []), manifest.still])];
}

/** Uniform context for a package's passes: its seed and the size its plates were rendered at. */
export function effectContext(manifest: LivePackageManifest): EffectContext {
  return { seed: manifest.seed, width: manifest.size.width, height: manifest.size.height };
}

/**
 * How the runtime draws a package: its plates as composite sources (plate 0 is the bottom), and one step per
 * pass or later plate. `passSteps[i]` is the step index of the package's pass `i`, for per-frame overrides.
 */
export interface LivePackageComposite {
  readonly plates: readonly ArtworkSource[];
  readonly steps: readonly CompositeStep[];
  readonly passSteps: readonly number[];
}

/** Lays a package out for `createCompositeRenderer`. Pass steps carry the given resting passes, in package order. */
export function livePackageComposite(pkg: LivePackage, passes: readonly ChainPass[]): LivePackageComposite {
  const { manifest, images } = pkg;
  const image = (file: string) => {
    const source = images[file];
    if (!source) throw new LivePackageError([`images: the package has no image for "${file}"`]);
    return source;
  };
  const plates: ArtworkSource[] = [];
  const steps: CompositeStep[] = [];
  const passSteps: number[] = [];
  for (const item of manifest.stack) {
    if (item.type === 'plate') {
      plates.push(image(item.file));
      if (plates.length > 1) steps.push({ kind: 'over', plate: plates.length - 1 });
      continue;
    }
    for (let index = 0; index < item.passes.length; index += 1) {
      const pass = passes[passSteps.length];
      if (!pass) throw new Error('The package has more passes than the compiled chain.');
      passSteps.push(steps.length);
      steps.push({ kind: 'pass', pass });
    }
  }
  if (manifest.background) {
    plates.push(image(manifest.background));
    steps.push({ kind: 'under', plate: plates.length - 1 });
  }
  return { plates, steps, passSteps };
}

export interface LoadLivePackageOptions {
  readonly registry?: EffectRegistry;
  readonly fetch?: typeof fetch;
  /** Decodes one image. Defaults to an `HTMLImageElement`, which WebGL uploads as the editor's Pixi does. */
  readonly loadImage?: (url: string) => Promise<ArtworkSource>;
}

/**
 * Fetches `manifest.json` (or the given manifest URL), validates it, and decodes every image it names, resolved
 * relative to the manifest.
 */
export async function loadLivePackage(url: string | URL, options: LoadLivePackageOptions = {}): Promise<LivePackage> {
  const fetchImpl = options.fetch ?? fetch;
  const manifestUrl = new URL(url, globalThis.location?.href);
  const response = await fetchImpl(manifestUrl);
  if (!response.ok) throw new Error(`Could not load the live package manifest (${response.status}): ${manifestUrl}`);
  const manifest = parseLivePackage(await response.json(), { registry: options.registry });
  const loadImage = options.loadImage ?? loadImageElement;
  const files = livePackageFiles(manifest);
  const decoded = await Promise.all(files.map((file) => loadImage(new URL(file, manifestUrl).href)));
  return { manifest, images: Object.fromEntries(files.map((file, index) => [file, decoded[index]])) };
}

async function loadImageElement(url: string): Promise<ArtworkSource> {
  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.src = url;
  await image.decode();
  return image;
}

function isAuthoredValue(value: unknown): boolean {
  return (
    (typeof value === 'number' && Number.isFinite(value)) || typeof value === 'string' || typeof value === 'boolean'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function describe(value: unknown): string {
  if (value === undefined) return 'nothing';
  return JSON.stringify(value) ?? String(value);
}

function unknownKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  prefix: string,
  fail: (path: string, message: string) => void,
) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) fail(`${prefix}${key}`, `unknown key; expected one of ${allowed.join(', ')}`);
  }
}
