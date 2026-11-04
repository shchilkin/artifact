import { describe, expect, it } from 'vitest';
import { applyTornPaper, type TornPaperSettings } from './effectPixelTornPaper';

const SOURCE: [number, number, number] = [200, 20, 30];
const PAPER: [number, number, number] = [246, 242, 233];
const BELOW: [number, number, number] = [10, 10, 10];

function solidSource(width: number, height: number) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = SOURCE[0];
    data[i + 1] = SOURCE[1];
    data[i + 2] = SOURCE[2];
    data[i + 3] = 255;
  }
  return data;
}

function settings(overrides: Partial<TornPaperSettings> = {}): TornPaperSettings {
  return {
    mode: 'reveal',
    keep: 'top',
    roughness: 60,
    position: 50,
    angle: 0,
    wander: 50,
    rim: 7,
    fibres: 40,
    shadow: 0,
    lift: 3.5,
    gap: 11,
    turn: 2,
    paperColor: '#f6f2e9',
    below: 'solid',
    belowColor: '#0a0a0a',
    unit: 1,
    seed: 7,
    ...overrides,
  };
}

function render(width: number, height: number, overrides: Partial<TornPaperSettings> = {}) {
  return applyTornPaper(solidSource(width, height), width, height, settings(overrides));
}

function pixel(data: Uint8ClampedArray, width: number, x: number, y: number) {
  const i = (y * width + x) * 4;
  return [data[i], data[i + 1], data[i + 2], data[i + 3]];
}

function near(value: number[], rgb: [number, number, number], tolerance = 24) {
  return rgb.every((channel, index) => Math.abs((value[index] ?? 0) - channel) <= tolerance);
}

/** Per column: the first row from the top that is no longer the source print. */
function tearRows(data: Uint8ClampedArray, width: number, height: number) {
  const rows: number[] = [];
  for (let x = 0; x < width; x += 1) {
    let y = 0;
    while (y < height && near(pixel(data, width, x, y), SOURCE)) y += 1;
    rows.push(y);
  }
  return rows;
}

describe('applyTornPaper', () => {
  it('keeps the print on one side of the tear and shows what is below on the other', () => {
    const data = render(160, 160);

    expect(near(pixel(data, 160, 80, 10), SOURCE)).toBe(true);
    expect(near(pixel(data, 160, 80, 150), BELOW)).toBe(true);
  });

  it('keeps the bottom piece when asked', () => {
    const data = render(160, 160, { keep: 'bottom' });

    expect(near(pixel(data, 160, 80, 10), BELOW)).toBe(true);
    expect(near(pixel(data, 160, 80, 150), SOURCE)).toBe(true);
  });

  it('leaves the revealed area transparent when nothing is below', () => {
    const data = render(160, 160, { below: 'clear' });

    expect(pixel(data, 160, 80, 150)[3]).toBe(0);
    expect(pixel(data, 160, 80, 10)[3]).toBe(255);
  });

  it('exposes white paper core along the torn edge', () => {
    const width = 200;
    const data = render(width, 200);
    let paperColumns = 0;
    for (let x = 0; x < width; x += 1) {
      for (let y = 0; y < 200; y += 1) {
        if (near(pixel(data, width, x, y), PAPER, 16)) {
          paperColumns += 1;
          break;
        }
      }
    }

    expect(paperColumns).toBeGreaterThan(width * 0.6);
  });

  it('tears along an uneven line', () => {
    const rows = tearRows(render(240, 240), 240, 240);

    expect(Math.max(...rows) - Math.min(...rows)).toBeGreaterThan(6);
  });

  it('is deterministic for a seed and changes with it', () => {
    const a = render(120, 120);
    const b = render(120, 120);
    const c = render(120, 120, { seed: 8 });

    expect(b).toEqual(a);
    expect(c).not.toEqual(a);
  });

  it('keeps the tear shape when the output size changes', () => {
    const small = tearRows(render(200, 200, { unit: 200 / 540 }), 200, 200);
    const large = tearRows(render(400, 400, { unit: 400 / 540 }), 400, 400);

    for (const fraction of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      const smallRow = small[Math.round(fraction * 199)] / 200;
      const largeRow = large[Math.round(fraction * 399)] / 400;
      expect(Math.abs(smallRow - largeRow)).toBeLessThan(0.03);
    }
  });

  it('measures the paper edge across a steep tear, not straight down', () => {
    const flat = render(240, 240, { angle: 0, roughness: 0, wander: 0, fibres: 0 });
    const steep = render(240, 240, { angle: 40, roughness: 0, wander: 0, fibres: 0 });
    const paperCount = (data: Uint8ClampedArray) => {
      let count = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (near([data[i], data[i + 1], data[i + 2]], PAPER, 16)) count += 1;
      }
      return count;
    };
    const flatCount = paperCount(flat);
    const steepCount = paperCount(steep);

    // A steep line through a square is longer, so it shows more rim, never less.
    expect(steepCount).toBeGreaterThan(flatCount * 0.95);
  });

  it.each([5, -5])('keeps a gap between split pieces with turn %i', (turn) => {
    const width = 200;
    const data = render(width, 200, { mode: 'split', gap: 6, turn, fibres: 0 });
    for (let x = 4; x < width - 4; x += 1) {
      let sawBelow = false;
      for (let y = 0; y < 200; y += 1) {
        if (near(pixel(data, width, x, y), BELOW, 30)) sawBelow = true;
      }
      expect(sawBelow, `column ${x}`).toBe(true);
    }
  });

  it('shows the print on both sides of a split', () => {
    const data = render(160, 160, { mode: 'split' });

    expect(near(pixel(data, 160, 80, 10), SOURCE)).toBe(true);
    expect(near(pixel(data, 160, 80, 150), SOURCE)).toBe(true);
  });

  it('casts a shadow onto what is below', () => {
    const flat = render(160, 160, { below: 'solid', belowColor: '#e0e0e0', shadow: 0 });
    const lifted = render(160, 160, { below: 'solid', belowColor: '#e0e0e0', shadow: 80, lift: 6 });
    const sum = (data: Uint8ClampedArray) =>
      data.reduce((total, value, index) => (index % 4 === 3 ? total : total + value), 0);

    expect(sum(lifted)).toBeLessThan(sum(flat));
  });
});
