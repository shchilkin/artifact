import { afterEach, describe, expect, it, vi } from 'vitest';
import { attachPointerInputs } from './inputTracker.js';
import { createLiveArtwork } from './liveArtwork.js';
import { createFakeGl, createManualScheduler } from './testing/fakeGl.js';

/** Enough of a DOM element for the tracker: events, a bounding rect, and a window with scroll and resize. */
class FakeElement extends EventTarget {
  rect = { left: 100, top: 300, width: 200, height: 100 };
  readonly view = Object.assign(new EventTarget(), { innerHeight: 800 });
  readonly ownerDocument = { defaultView: this.view };
  getBoundingClientRect() {
    return this.rect;
  }
}

const pointer = (
  type: string,
  clientX: number,
  clientY: number,
  pointerType: 'mouse' | 'touch' = 'mouse',
  isPrimary = true,
) => Object.assign(new Event(type), { clientX, clientY, pointerType, isPrimary });

function tracked() {
  const element = new FakeElement();
  let clock = 0;
  const onChange = vi.fn();
  const inputs = attachPointerInputs(element as unknown as HTMLElement, {
    now: () => clock,
    onChange,
    hoverSeconds: 0.2,
  });
  return {
    element,
    inputs,
    onChange,
    at(ms: number) {
      clock = ms;
    },
  };
}

describe('attachPointerInputs', () => {
  it('normalises pointer events to the canvas, y = 0 at the top', () => {
    const { element, inputs, onChange } = tracked();
    element.dispatchEvent(pointer('pointerenter', 100, 300));
    element.dispatchEvent(pointer('pointermove', 150, 375));
    expect(inputs.sample(0)).toMatchObject({ 'pointer.x': 0.25, 'pointer.y': 0.75 });
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('eases hover in on enter and out on leave for a mouse', () => {
    const { element, inputs, at } = tracked();
    element.dispatchEvent(pointer('pointerenter', 150, 350));
    at(200);
    expect(inputs.sample().hover).toBe(1);
    element.dispatchEvent(pointer('pointerleave', 90, 350));
    at(300);
    expect(inputs.sample().hover).toBe(0.5);
  });

  it('on touch, hover follows touch-down and ends on release or cancel', () => {
    const { element, inputs, at } = tracked();
    // Touch enter/leave are ignored; the press is what counts.
    element.dispatchEvent(pointer('pointerenter', 150, 350, 'touch'));
    at(200);
    expect(inputs.sample().hover).toBe(0);
    element.dispatchEvent(pointer('pointerdown', 250, 325, 'touch'));
    at(400);
    expect(inputs.sample()).toMatchObject({ hover: 1, 'pointer.x': 0.75, 'pointer.y': 0.25, 'click.x': 0.75 });
    element.dispatchEvent(pointer('pointercancel', 250, 325, 'touch'));
    at(600);
    expect(inputs.sample().hover).toBe(0);
  });

  it('records clicks and ignores secondary pointers', () => {
    const { element, inputs } = tracked();
    element.dispatchEvent(pointer('pointerdown', 120, 310, 'touch', false));
    expect(inputs.sample(0).click).toBe(0);
    element.dispatchEvent(pointer('pointerdown', 120, 310));
    expect(inputs.sample(0)).toMatchObject({ click: 1, 'click.x': 0.1, 'click.y': 0.1 });
  });

  it('tracks scroll progress through the viewport', () => {
    const { element, inputs, onChange } = tracked();
    // top 300, height 100, viewport 800: (800 - 300) / 900.
    expect(inputs.sample(0).scroll).toBeCloseTo(5 / 9);
    element.rect = { ...element.rect, top: -100 };
    element.view.dispatchEvent(new Event('scroll'));
    expect(inputs.sample(0).scroll).toBe(1);
    expect(onChange).toHaveBeenCalledOnce();
    // Scroll events that do not move the artwork do not ask for a redraw.
    element.view.dispatchEvent(new Event('scroll'));
    expect(onChange).toHaveBeenCalledOnce();
  });

  it('detach removes every listener', () => {
    const { element, inputs, onChange } = tracked();
    inputs.detach();
    inputs.detach();
    element.dispatchEvent(pointer('pointerenter', 100, 300));
    element.dispatchEvent(pointer('pointermove', 150, 375));
    element.dispatchEvent(pointer('pointerdown', 150, 375));
    element.rect = { ...element.rect, top: -100 };
    element.view.dispatchEvent(new Event('scroll'));
    expect(onChange).not.toHaveBeenCalled();
    expect(inputs.sample(0)).toMatchObject({ 'pointer.x': 0.5, click: 0, hover: 0 });
  });
});

describe('createLiveArtwork', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function liveCanvas(reducedMotion: boolean, bindings: unknown) {
    vi.stubGlobal('HTMLElement', FakeElement);
    const fake = createFakeGl();
    const canvas = Object.assign(new FakeElement(), {
      width: 540,
      height: 540,
      getContext: (kind: string) => (kind === 'webgl2' ? fake.gl : null),
    });
    const scheduler = createManualScheduler();
    const artwork = createLiveArtwork({
      canvas: canvas as unknown as HTMLCanvasElement,
      source: {} as ImageBitmap,
      passes: [{ effect: 'noiseWarp', layer: { noiseWarp: 0 } }],
      context: { seed: 1, width: 540, height: 540 },
      bindings,
      reducedMotion,
      observeVisibility: null,
      scheduler,
    });
    return { artwork, canvas, fake, scheduler };
  }

  const speedBinding = {
    version: 1,
    bindings: [{ from: { input: 'pointer.speed' }, to: { pass: 0, field: 'noiseWarp' }, range: [0, 120] }],
  };

  it('redraws a stopped artwork on pointer events and detaches on destroy', () => {
    const { artwork, canvas, fake } = liveCanvas(false, speedBinding);
    expect(artwork.state.frames).toBe(1);
    canvas.dispatchEvent(pointer('pointerenter', 10, 10));
    canvas.dispatchEvent(pointer('pointermove', 200, 200));
    expect(artwork.state.frames).toBe(3);
    // The bound pass stays in the chain although its authored amount is zero.
    expect(fake.counts.draws).toBe(3);
    artwork.destroy();
    canvas.dispatchEvent(pointer('pointermove', 300, 300));
    expect(artwork.state).toMatchObject({ status: 'destroyed', frames: 3 });
    expect(fake.live()).toEqual({});
  });

  it('does not listen when no binding reads an input', () => {
    const { artwork, canvas } = liveCanvas(false, {
      version: 1,
      loop: { durationSeconds: 2 },
      bindings: [{ from: { track: 'wave' }, to: { pass: 0, field: 'noiseWarp' }, range: [0, 50] }],
    });
    canvas.dispatchEvent(pointer('pointermove', 200, 200));
    expect(artwork.state.frames).toBe(1);
    artwork.seek(0.5);
    expect(artwork.state.frames).toBe(2);
  });

  it('keeps the authored still under reduced motion', () => {
    const { artwork, canvas, scheduler } = liveCanvas(true, speedBinding);
    artwork.start();
    canvas.dispatchEvent(pointer('pointerenter', 10, 10));
    canvas.dispatchEvent(pointer('pointermove', 200, 200));
    scheduler.step(5);
    expect(artwork.state).toMatchObject({ status: 'still', frames: 1 });
    expect(scheduler.requested).toBe(0);
  });
});
