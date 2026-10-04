import { type Artwork, type ArtworkOptions, createArtwork } from './artwork.js';
import { compileLiveChain, type LiveChainOptions } from './bindings.js';
import type { PointerModelOptions } from './inputs.js';
import { attachPointerInputs, type PointerInputs } from './inputTracker.js';

export interface LiveArtworkOptions extends Omit<ArtworkOptions, 'chain' | 'frameUniforms'>, LiveChainOptions {
  /**
   * Pointer tracking on the canvas for bindings that read inputs. Default on for on-page canvases; `false` leaves
   * inputs to `setInput`. Values set through `setInput` take precedence over tracked ones.
   */
  readonly pointer?: boolean | PointerModelOptions;
}

/**
 * An artwork whose effect parameters follow bindings: time tracks over the loop and visitor inputs. Under reduced
 * motion every binding is off and the artwork shows the authored still.
 */
export function createLiveArtwork(options: LiveArtworkOptions): Artwork {
  const live = compileLiveChain(options);
  let tracker: PointerInputs | null = null;
  const now = options.scheduler ? () => options.scheduler!.now() : () => performance.now();

  const artwork = createArtwork({
    ...options,
    chain: live.chain,
    frameUniforms: (frame) =>
      live.frameUniforms(
        tracker
          ? {
              ...frame,
              inputs: { ...tracker.sample(frame.clock), ...frame.inputs },
            }
          : frame,
      ),
  });

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
    destroy() {
      tracker?.detach();
      tracker = null;
      artwork.destroy();
    },
    get state() {
      return artwork.state;
    },
  };
}

function isHtmlElement(canvas: HTMLCanvasElement | OffscreenCanvas): canvas is HTMLCanvasElement {
  return typeof HTMLElement === 'function' && canvas instanceof HTMLElement;
}
