import { type Artwork, type ArtworkCommonOptions, createArtwork, type FrameState } from './artwork.js';
import { compileLiveChain, type LiveChain, type LiveChainOptions } from './bindings.js';
import type { PointerModelOptions } from './inputs.js';
import { attachPointerInputs, type PointerInputs } from './inputTracker.js';
import type { LayerControl, LayerRef } from './layers.js';
import { effectContext, type LivePackage, livePackagePasses, livePackagePlates } from './livePackage.js';
import type { EffectRegistry } from './registry.js';
import type { ArtworkSource } from './types.js';

interface LiveArtworkCommonOptions extends ArtworkCommonOptions, LayerControl {
  /**
   * Pointer tracking on the canvas for bindings that read inputs. Default on for on-page canvases; `false` leaves
   * inputs to `setInput`. Values set through `setInput` take precedence over tracked ones.
   */
  readonly pointer?: boolean | PointerModelOptions;
}

/** A live artwork from one source image and authored passes. */
export interface ChainLiveArtworkOptions extends LiveArtworkCommonOptions, LiveChainOptions {
  readonly source: ArtworkSource;
}

/** A live artwork from a live package; bindings default to the package's own. */
export interface PackageLiveArtworkOptions extends LiveArtworkCommonOptions {
  readonly livePackage: LivePackage;
  /** Bindings JSON targeting the package's passes; replaces `manifest.bindings` when given. */
  readonly bindings?: unknown;
  readonly registry?: EffectRegistry;
}

export type LiveArtworkOptions = ChainLiveArtworkOptions | PackageLiveArtworkOptions;

/** An artwork whose bindings a host can switch per layer (issue #429). */
export interface LiveArtwork extends Artwork {
  /** Layers the bindings and layer options can address, bottom first for a package. */
  readonly layers: readonly LayerRef[];
  /**
   * Replaces the layer configuration given at creation (`layers`, `layerDefaults`). A running artwork follows it from
   * its next frame; a stopped one redraws once. Throws `LayerOptionsError` for a key that names no layer or several.
   */
  setLayerOptions(control: LayerControl): void;
}

/**
 * An artwork whose effect parameters follow bindings: time tracks over the loop and visitor inputs. Under reduced
 * motion every binding is off and the artwork shows the authored still. `layers` and `layerDefaults` switch bindings
 * per Artifact layer (see `LayerControl`).
 */
export function createLiveArtwork(options: LiveArtworkOptions): LiveArtwork {
  const live = compileOptions(options);
  let tracker: PointerInputs | null = null;
  const now = options.scheduler ? () => options.scheduler!.now() : () => performance.now();

  // Passes and plates read the same frame: sample the tracker once per frame state.
  let tracked: { readonly frame: FrameState; readonly withInputs: FrameState } | null = null;
  const withTracked = (frame: FrameState): FrameState => {
    if (!tracker) return frame;
    if (tracked?.frame !== frame) {
      tracked = { frame, withInputs: { ...frame, inputs: { ...tracker.sample(frame.clock), ...frame.inputs } } };
    }
    return tracked.withInputs;
  };
  const frameUniforms = (frame: FrameState) => live.frameUniforms(withTracked(frame));
  const plateMotion = {
    moving: live.plates.moving,
    transforms: (frame: FrameState) => live.plates.transforms(withTracked(frame)),
  };
  const artwork =
    'livePackage' in options
      ? createArtwork({ ...options, chain: live.chain, frameUniforms, plateMotion })
      : createArtwork({ ...options, chain: live.chain, frameUniforms });

  const canvas = options.canvas;
  if (options.pointer !== false && live.inputs.length > 0 && isHtmlElement(canvas)) {
    tracker = attachPointerInputs(canvas, {
      ...(typeof options.pointer === 'object' ? options.pointer : {}),
      now,
      onChange: () => artwork.redraw(),
    });
  }

  return {
    start: () => artwork.start(),
    pause: () => artwork.pause(),
    seek: (time) => artwork.seek(time),
    resize: (cssWidth, cssHeight) => artwork.resize(cssWidth, cssHeight),
    setInput: (name, value) => artwork.setInput(name, value),
    redraw: () => artwork.redraw(),
    layers: live.layers,
    setLayerOptions(control) {
      live.setLayerOptions(control);
      artwork.redraw();
    },
    destroy() {
      tracker?.detach();
      tracker = null;
      artwork.destroy();
    },
    get state() {
      return artwork.state;
    },
    ready: artwork.ready,
  };
}

function compileOptions(options: LiveArtworkOptions): LiveChain {
  if (!('livePackage' in options)) return compileLiveChain(options);
  const { manifest } = options.livePackage;
  const passes = livePackagePasses(manifest);
  const live = compileLiveChain({
    passes,
    plates: livePackagePlates(manifest),
    context: effectContext(manifest),
    bindings: options.bindings ?? manifest.bindings,
    registry: options.registry,
    layers: options.layers,
    layerDefaults: options.layerDefaults,
  });
  // Package passes are on at rest, so none is dropped and chain index i is package pass i.
  if (live.chain.length !== passes.length) throw new Error('A package pass is off at rest; re-export the package.');
  return live;
}

function isHtmlElement(canvas: HTMLCanvasElement | OffscreenCanvas): canvas is HTMLCanvasElement {
  return typeof HTMLElement === 'function' && canvas instanceof HTMLElement;
}
