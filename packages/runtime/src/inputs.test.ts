import { describe, expect, it } from 'vitest';
import { createPointerModel, normalizePointer, RESTING_INPUTS, scrollProgress, smoothstep } from './inputs.js';

const rect = { left: 100, top: 50, width: 400, height: 200 };

describe('pointer position', () => {
  it('normalises client coordinates to the artwork with y = 0 at the top edge', () => {
    expect(normalizePointer(100, 50, rect)).toEqual({ x: 0, y: 0 });
    expect(normalizePointer(300, 100, rect)).toEqual({ x: 0.5, y: 0.25 });
    expect(normalizePointer(500, 250, rect)).toEqual({ x: 1, y: 1 });
  });

  it('clamps points outside the artwork and survives an empty rect', () => {
    expect(normalizePointer(0, 900, rect)).toEqual({ x: 0, y: 1 });
    expect(normalizePointer(10, 10, { left: 0, top: 0, width: 0, height: 0 })).toEqual({ x: 0.5, y: 0.5 });
  });

  it('reports moves as pointer.x and pointer.y, resting at the centre', () => {
    const model = createPointerModel();
    expect(model.sample(0)).toEqual(RESTING_INPUTS);
    model.enter(10);
    model.move(0.2, 0.9, 10);
    expect(model.sample(10)).toMatchObject({ 'pointer.x': 0.2, 'pointer.y': 0.9 });
  });
});

describe('pointer speed and direction', () => {
  it('measures speed in artwork lengths per second, smoothed, and maps maxSpeed to 1', () => {
    const model = createPointerModel({ speedSmoothing: 0.1, maxSpeed: 2 });
    model.sample(0);
    model.enter(0);
    model.move(0, 0.5, 0);
    // 0.1 artwork widths in 0.1 s is 1 length/s: half of maxSpeed once fully smoothed.
    let speed = 0;
    for (let ms = 100; ms <= 1000; ms += 100) {
      model.move(ms / 1000, 0.5, ms);
      const previous = speed;
      speed = model.sample(ms)['pointer.speed'];
      // Exponential smoothing approaches the raw speed from below, without overshoot.
      expect(speed).toBeGreaterThan(previous);
      expect(speed).toBeLessThanOrEqual(0.5 + 1e-9);
    }
    expect(speed).toBeCloseTo(0.5, 3);
    // One step of smoothing covers 1 - e^(-dt / τ) of the gap.
    const fresh = createPointerModel({ speedSmoothing: 0.1, maxSpeed: 2 });
    fresh.sample(0);
    fresh.move(0, 0.5, 0);
    fresh.move(0.1, 0.5, 100);
    expect(fresh.sample(100)['pointer.speed']).toBeCloseTo(0.5 * (1 - Math.exp(-1)), 6);
  });

  it('decays to zero once the pointer stops and keeps the last heading', () => {
    const model = createPointerModel({ speedSmoothing: 0.1 });
    model.sample(0);
    model.move(0.5, 0.5, 0);
    model.move(0.5, 0.2, 50);
    const moving = model.sample(50);
    expect(moving['pointer.dirX']).toBeCloseTo(0);
    expect(moving['pointer.dirY']).toBeCloseTo(-1);
    const stopped = model.sample(2000);
    expect(stopped['pointer.speed']).toBeLessThan(1e-6);
    expect(stopped['pointer.dirY']).toBeCloseTo(-1);
  });

  it('caps speed at 1', () => {
    const model = createPointerModel({ speedSmoothing: 0.01 });
    model.sample(0);
    model.move(0, 0, 0);
    model.move(1, 1, 10);
    expect(model.sample(10)['pointer.speed']).toBe(1);
  });

  it('does not count re-entry or a new touch as movement', () => {
    const model = createPointerModel();
    model.sample(0);
    model.enter(0);
    model.move(0.1, 0.1, 0);
    model.leave(10);
    model.enter(20);
    model.move(0.9, 0.9, 20);
    expect(model.sample(30)['pointer.speed']).toBe(0);
    model.down(0.1, 0.9, 40, true);
    expect(model.sample(50)['pointer.speed']).toBe(0);
  });

  it('ignores repeated samples at the same time', () => {
    const model = createPointerModel();
    model.sample(0);
    model.move(0, 0, 0);
    model.move(0.3, 0, 100);
    const first = model.sample(100);
    expect(model.sample(100)).toEqual(first);
  });
});

describe('hover', () => {
  it('eases from 0 to 1 over hoverSeconds and back', () => {
    const model = createPointerModel({ hoverSeconds: 0.2 });
    model.enter(1000);
    expect(model.sample(1000).hover).toBe(0);
    expect(model.sample(1050).hover).toBeCloseTo(smoothstep(0.25));
    expect(model.sample(1100).hover).toBeCloseTo(0.5);
    expect(model.sample(1200).hover).toBe(1);
    model.leave(1300);
    expect(model.sample(1350).hover).toBeCloseTo(smoothstep(0.75));
    expect(model.sample(1500).hover).toBe(0);
  });

  it('turns around from where it is when the pointer leaves mid-ease', () => {
    const model = createPointerModel({ hoverSeconds: 0.2 });
    model.enter(0);
    model.leave(100);
    expect(model.sample(100).hover).toBeCloseTo(0.5);
    expect(model.sample(150).hover).toBeCloseTo(smoothstep(0.25));
    expect(model.sample(200).hover).toBe(0);
  });

  it('follows touch-down on touch, and a mouse release does not end hover', () => {
    const model = createPointerModel({ hoverSeconds: 0.2 });
    model.down(0.3, 0.7, 0, true);
    expect(model.sample(200)).toMatchObject({ hover: 1, 'pointer.x': 0.3, 'pointer.y': 0.7 });
    model.up(200, true);
    expect(model.sample(400).hover).toBe(0);

    const mouse = createPointerModel({ hoverSeconds: 0.2 });
    mouse.enter(0);
    mouse.down(0.5, 0.5, 100, false);
    mouse.up(150, false);
    expect(mouse.sample(400).hover).toBe(1);
  });
});

describe('click', () => {
  it('is an impulse of 1 at the press that decays exponentially, with the press position', () => {
    const model = createPointerModel({ clickDecay: 0.5 });
    expect(model.sample(0).click).toBe(0);
    model.down(0.25, 0.75, 1000, false);
    expect(model.sample(1000)).toMatchObject({ click: 1, 'click.x': 0.25, 'click.y': 0.75 });
    expect(model.sample(1500).click).toBeCloseTo(Math.exp(-1));
    expect(model.sample(3000).click).toBeCloseTo(Math.exp(-4));
    // A second press restarts the impulse at its own position.
    model.down(0.9, 0.1, 3000, false);
    expect(model.sample(3000)).toMatchObject({ click: 1, 'click.x': 0.9, 'click.y': 0.1 });
  });
});

describe('scroll', () => {
  it('runs 0 → 1 as the artwork passes through the viewport', () => {
    const viewport = 800;
    // Top edge at the viewport bottom: just entering.
    expect(scrollProgress({ top: 800, height: 200 }, viewport)).toBe(0);
    expect(scrollProgress({ top: 300, height: 200 }, viewport)).toBe(0.5);
    // Bottom edge at the viewport top: just left.
    expect(scrollProgress({ top: -200, height: 200 }, viewport)).toBe(1);
    expect(scrollProgress({ top: 2000, height: 200 }, viewport)).toBe(0);
    expect(scrollProgress({ top: -900, height: 200 }, viewport)).toBe(1);
  });

  it('reports the latest progress, clamped', () => {
    const model = createPointerModel();
    model.setScroll(0.4);
    expect(model.sample(0).scroll).toBe(0.4);
    model.setScroll(3);
    expect(model.sample(0).scroll).toBe(1);
  });
});
